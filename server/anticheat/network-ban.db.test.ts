import { randomBytes, randomInt } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { createPgAdapter } from "@/server/pg-adapter";
import {
  banGroupWith,
  banNetworkWith,
  findNetworkBans,
  followDeviceWith,
  keepNetworkBanWith,
  liftNetworkBanWith,
  NetworkBanError,
  purgeExpiredNetworkBans,
  type FollowRules,
} from "./network-ban-core";

vi.mock("server-only", () => ({}));

// Bans réseau sur une vraie base (base de test isolée) : sauté sans DATABASE_URL_TEST.
//   DATABASE_URL_TEST="postgresql://…" npx vitest run server/anticheat/network-ban.db.test.ts
// Joueurs jetables supprimés à la fin, avec les bans qu'ils ont posés ou qui viennent d'eux.

const url = process.env.DATABASE_URL_TEST;
const CAP = 8;
const RULES: FollowRules = { enabled: true, ipv4: true, maxOthers: 0, days: 30, perDevice: 5 };

describe.skipIf(!url)("bans réseau (base réelle)", () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  const users: string[] = [];

  // IP publiques tirées au hasard (jamais une plage réservée), appareils au format du cookie
  const ip = () => `81.${randomInt(0, 256)}.${randomInt(0, 256)}.${randomInt(1, 255)}`;
  const device = () => randomBytes(16).toString("hex");
  const v6group = () => randomInt(1, 0xffff).toString(16);

  async function player(role: "USER" | "ADMIN" | "DEV" = "USER") {
    const user = await prisma.user.create({ data: { username: `nb-${randomBytes(4).toString("hex")}`, role, isGuest: false } });
    users.push(user.id);
    return user.id;
  }
  const seen = (userId: string, kind: "IP" | "DEVICE", value: string) => prisma.userSignal.create({ data: { userId, kind, value, firstEvent: "LOGIN" } });
  const signalIds = async (userId: string, where: { kind?: "IP" | "DEVICE"; value?: string } = {}) =>
    (await prisma.userSignal.findMany({ where: { userId, ...where }, select: { id: true } })).map((s) => s.id);
  const code = async (p: Promise<unknown>) => {
    try {
      await p;
      return null;
    } catch (e) {
      return e instanceof NetworkBanError ? e.code : String(e);
    }
  };
  const ban = (adminId: string, userId: string, ids: string[], banAccount = false, ipv4BanDays = 0) =>
    banNetworkWith(prisma, { adminId, userId, signalIds: ids, banAccount, reason: "triche", now: new Date(), sharedIpCap: CAP, ipv4BanDays });

  afterAll(async () => {
    await prisma.networkBan.deleteMany({ where: { OR: [{ userId: { in: users } }, { createdById: { in: users } }] } });
    // Le journal de l'équipe référence l'admin de test : effacé avant les comptes
    await prisma.adminLog.deleteMany({ where: { adminId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  });

  it("bannit depuis la fiche les IP et appareils choisis, et le compte", async () => {
    const [admin, cheat] = [await player("ADMIN"), await player()];
    const [address, dev] = [ip(), device()];
    await seen(cheat, "IP", address);
    await seen(cheat, "DEVICE", dev);
    await prisma.session.create({ data: { userId: cheat, sessionToken: randomBytes(16).toString("hex"), expires: new Date(Date.now() + 86_400_000) } });

    expect(await ban(admin, cheat, await signalIds(cheat), true)).toEqual({ bans: 2, account: true });
    const rows = await prisma.networkBan.findMany({ where: { userId: cheat }, select: { kind: true, value: true, source: true, expiresAt: true, createdById: true } });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.source === "MANUAL" && r.expiresAt === null && r.createdById === admin)).toBe(true);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: cheat } })).bannedAt).not.toBeNull();
    expect(await prisma.session.count({ where: { userId: cheat } })).toBe(0);
    expect(await findNetworkBans(prisma, { ipKey: address, device: dev }, new Date())).toHaveLength(2);
    // Déjà en place : un second passage ne double rien et ne lève pas
    expect(await ban(admin, cheat, await signalIds(cheat))).toEqual({ bans: 0, account: false });
  });

  it("regroupe les adresses d'un même /64 et refuse une IP de l'équipe ou privée", async () => {
    const [admin, cheat] = [await player("ADMIN"), await player()];
    const prefix = `2a01:cb00:${v6group()}:1`;
    await seen(cheat, "IP", `${prefix}::5`);
    await seen(cheat, "IP", `${prefix}:abcd::7`);
    const staffIp = ip();
    await seen(admin, "IP", staffIp);
    await seen(cheat, "IP", staffIp);
    await seen(cheat, "IP", "192.168.1.20");

    expect(await code(ban(admin, cheat, await signalIds(cheat)))).toBe("REFUSED");
    expect(await code(ban(admin, cheat, await signalIds(cheat, { value: "192.168.1.20" })))).toBe("REFUSED");
    const v6 = (await prisma.userSignal.findMany({ where: { userId: cheat, value: { startsWith: "2a01:" } }, select: { id: true } })).map((s) => s.id);
    expect(await ban(admin, cheat, v6)).toEqual({ bans: 1, account: false });
    const [row] = await prisma.networkBan.findMany({ where: { userId: cheat }, select: { value: true } });
    expect(row.value).toBe(`${prefix}::/64`);
  });

  it("refuse de bannir l'équipe, soi-même ou rien du tout", async () => {
    const [admin, dev, cheat] = [await player("ADMIN"), await player("DEV"), await player()];
    expect(await code(ban(admin, dev, [], true))).toBe("STAFF_TARGET");
    expect(await code(ban(admin, admin, [], true))).toBe("SELF");
    expect(await code(ban(admin, cheat, []))).toBe("NOTHING");
    expect(await code(ban(cheat, dev, [], true))).toBe("FORBIDDEN");
  });

  it("bannit un groupe et saute ce qui couperait un compte hors du groupe", async () => {
    const [admin, a, b, outsider] = [await player("ADMIN"), await player(), await player(), await player()];
    const [own, shared, devA] = [ip(), ip(), device()];
    await seen(a, "IP", own);
    await seen(b, "IP", own);
    await seen(a, "IP", shared);
    await seen(outsider, "IP", shared);
    await seen(a, "DEVICE", devA);

    const res = await banGroupWith(prisma, { adminId: admin, userIds: [a, b], reason: "doubles", now: new Date(), sharedIpCap: CAP, ipv4BanDays: 0 });
    expect(res.accounts).toBe(2);
    expect(res.bans).toBe(2);
    expect(res.skipped).toEqual([{ kind: "IP", value: expect.stringMatching(/^81\.\d+\.x\.x$/), state: "SHARED" }]);
    expect(await prisma.networkBan.count({ where: { source: "GROUP", value: { in: [own, devA] } } })).toBe(2);
    expect(await prisma.networkBan.count({ where: { value: shared } })).toBe(0);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: outsider } })).bannedAt).toBeNull();

    const staff = await player("DEV");
    expect(await code(banGroupWith(prisma, { adminId: admin, userIds: [outsider, staff], reason: "x", now: new Date(), sharedIpCap: CAP, ipv4BanDays: 0 }))).toBe("STAFF_TARGET");
  });

  it("fait suivre le ban d'un appareil sur ses nouvelles IP, avec ses garde-fous", async () => {
    const [admin, cheat, other] = [await player("ADMIN"), await player(), await player()];
    const dev = device();
    await seen(cheat, "DEVICE", dev);
    await ban(admin, cheat, await signalIds(cheat), true);
    const [deviceBan] = await findNetworkBans(prisma, { ipKey: null, device: dev }, new Date());
    const follow = (ipKey: string, rules: FollowRules = RULES) => followDeviceWith(prisma, { deviceBan, device: dev, ipKey, now: new Date() }, rules);

    // Nouvelle IP propre : bannie pour 30 jours, rattachée à l'appareil
    const fresh = ip();
    expect(await follow(fresh)).toBe("FOLLOW");
    const auto = await prisma.networkBan.findUniqueOrThrow({ where: { kind_value: { kind: "IP", value: fresh } } });
    expect(auto).toMatchObject({ source: "AUTO", parentId: deviceBan.id, userId: cheat });
    expect(auto.expiresAt!.getTime() - Date.now()).toBeGreaterThan(29 * 86_400_000);

    // Deux accès simultanés depuis la même IP : un seul ban
    const twice = ip();
    await Promise.all([follow(twice), follow(twice)]);
    expect(await prisma.networkBan.count({ where: { value: twice } })).toBe(1);

    // Un autre joueur actif l'utilise, ou l'équipe : rien
    const sharedIp = ip();
    await seen(other, "IP", sharedIp);
    expect(await follow(sharedIp)).toBe("SHARED");
    const staffIp = ip();
    await seen(admin, "IP", staffIp);
    expect(await follow(staffIp)).toBe("STAFF");
    // Les comptes déjà vus sur l'appareil banni ne comptent pas comme « autres »
    const ownIp = ip();
    await seen(cheat, "IP", ownIp);
    expect(await follow(ownIp)).toBe("FOLLOW");
    // Plafond par appareil, et réglage coupé
    expect(await follow(ip(), { ...RULES, perDevice: 3 })).toBe("LIMIT");
    expect(await follow(ip(), { ...RULES, enabled: false })).toBe("OFF");
    // Réglage IPv4 coupé : une IPv4 n'est plus suivie
    expect(await follow(ip(), { ...RULES, ipv4: false })).toBe("IPV4");

    // Rendu définitif : il ne suit plus l'appareil et survit à sa levée
    await keepNetworkBanWith(prisma, { adminId: admin, banId: auto.id, reason: "confirmé" });
    expect(await prisma.networkBan.findUniqueOrThrow({ where: { id: auto.id } })).toMatchObject({ expiresAt: null, parentId: null });
    expect(await code(keepNetworkBanWith(prisma, { adminId: admin, banId: deviceBan.id, reason: "x" }))).toBe("NOT_EXPIRING");

    // Lever l'appareil lève les IP qu'il suit encore
    await liftNetworkBanWith(prisma, { adminId: admin, banId: deviceBan.id, reason: "erreur" });
    expect(await prisma.networkBan.count({ where: { value: { in: [dev, twice, ownIp] } } })).toBe(0);
    expect(await prisma.networkBan.count({ where: { id: auto.id } })).toBe(1);
    expect(await code(liftNetworkBanWith(prisma, { adminId: admin, banId: deviceBan.id, reason: "erreur" }))).toBe("NOT_FOUND");
  });

  it("bannit une ferme de 10 comptes sur une IP, mais pas une IP où 9 joueurs actifs hors du groupe passent", async () => {
    const admin = await player("ADMIN");
    const farm = await Promise.all(Array.from({ length: 10 }, () => player()));
    const [farmIp, publicIp] = [ip(), ip()];
    for (const id of farm) await seen(id, "IP", farmIp);
    await seen(farm[0], "IP", publicIp);
    for (let i = 0; i < CAP + 1; i++) await seen(await player(), "IP", publicIp);

    const res = await banGroupWith(prisma, { adminId: admin, userIds: farm, reason: "ferme", now: new Date(), sharedIpCap: CAP, ipv4BanDays: 0 });
    expect(res.accounts).toBe(10);
    expect(await prisma.networkBan.count({ where: { kind: "IP", value: farmIp, source: "GROUP" } })).toBe(1);
    expect(res.skipped).toEqual([{ kind: "IP", value: expect.stringMatching(/^81\.\d+\.x\.x$/), state: "CAP" }]);
    expect(await prisma.networkBan.count({ where: { value: publicIp } })).toBe(0);
  });

  it("ban d'IPv4 à durée (multiAccount.ipv4BanDays) : l'IPv4 expire, l'appareil reste définitif, « Rendre définitif » la garde", async () => {
    const [admin, cheat] = [await player("ADMIN"), await player()];
    const [address, dev] = [ip(), device()];
    await seen(cheat, "IP", address);
    await seen(cheat, "DEVICE", dev);
    expect(await ban(admin, cheat, await signalIds(cheat), false, 90)).toEqual({ bans: 2, account: false });
    const v4 = await prisma.networkBan.findUniqueOrThrow({ where: { kind_value: { kind: "IP", value: address } } });
    expect(v4.expiresAt!.getTime() - Date.now()).toBeGreaterThan(89 * 86_400_000);
    expect((await prisma.networkBan.findUniqueOrThrow({ where: { kind_value: { kind: "DEVICE", value: dev } } })).expiresAt).toBeNull();
    await keepNetworkBanWith(prisma, { adminId: admin, banId: v4.id, reason: "confirmé" });
    expect((await prisma.networkBan.findUniqueOrThrow({ where: { id: v4.id } })).expiresAt).toBeNull();
  });

  it("« Lever et ne plus suivre ici » : le suivi ne reprend plus l'IP, jusqu'à un nouveau ban de l'admin", async () => {
    const [admin, cheat] = [await player("ADMIN"), await player()];
    const dev = device();
    await seen(cheat, "DEVICE", dev);
    await ban(admin, cheat, await signalIds(cheat), true);
    const [deviceBan] = await findNetworkBans(prisma, { ipKey: null, device: dev }, new Date());
    const follow = (ipKey: string) => followDeviceWith(prisma, { deviceBan, device: dev, ipKey, now: new Date() }, RULES);

    const shared = ip();
    expect(await follow(shared)).toBe("FOLLOW");
    const auto = await prisma.networkBan.findUniqueOrThrow({ where: { kind_value: { kind: "IP", value: shared } } });
    // Un ban qui ne suit pas d'appareil ne s'exempte pas
    expect(await code(liftNetworkBanWith(prisma, { adminId: admin, banId: deviceBan.id, reason: "x", exempt: true }))).toBe("NOT_AUTO");
    await liftNetworkBanWith(prisma, { adminId: admin, banId: auto.id, reason: "IP de lycée", exempt: true });
    expect(await findNetworkBans(prisma, { ipKey: shared, device: null }, new Date())).toHaveLength(0);
    expect(await follow(shared)).toBe("EXEMPT");

    // L'admin bannit lui-même l'IP : l'exemption cède la place au ban
    const target = await player();
    await seen(target, "IP", shared);
    expect(await ban(admin, target, await signalIds(target))).toEqual({ bans: 1, account: false });
    expect(await prisma.networkBan.findUniqueOrThrow({ where: { kind_value: { kind: "IP", value: shared } } })).toMatchObject({ source: "MANUAL", liftedAt: null });
  });

  it("garde le ban quand le compte disparaît, et ignore un ban automatique expiré", async () => {
    const [admin, cheat] = [await player("ADMIN"), await player()];
    const address = ip();
    await seen(cheat, "IP", address);
    await ban(admin, cheat, await signalIds(cheat), true);
    await prisma.user.delete({ where: { id: cheat } });
    const kept = await prisma.networkBan.findUniqueOrThrow({ where: { kind_value: { kind: "IP", value: address } } });
    expect(kept.userId).toBeNull();
    await prisma.networkBan.delete({ where: { id: kept.id } });

    const [old, again, forever] = [ip(), ip(), ip()];
    const expired = { kind: "IP" as const, source: "AUTO" as const, reason: "x", userId: admin, expiresAt: new Date(Date.now() - 1000) };
    await prisma.networkBan.create({ data: { ...expired, value: old } });
    await prisma.networkBan.create({ data: { ...expired, value: again } });
    await prisma.networkBan.create({ data: { kind: "IP", value: forever, source: "MANUAL", reason: "x", userId: admin } });
    expect(await findNetworkBans(prisma, { ipKey: old, device: null }, new Date())).toHaveLength(0);
    // Un ban expiré pas encore effacé ne bloque pas un ban neuf sur la même IP
    const target = await player();
    await seen(target, "IP", again);
    expect(await ban(admin, target, await signalIds(target))).toEqual({ bans: 1, account: false });
    expect(await prisma.networkBan.findUniqueOrThrow({ where: { kind_value: { kind: "IP", value: again } } })).toMatchObject({ source: "MANUAL", expiresAt: null });
    // Le ménage du cron efface l'expiré (son IP ne reste pas en base), jamais un ban définitif
    expect(await purgeExpiredNetworkBans(prisma, new Date())).toBeGreaterThanOrEqual(1);
    expect(await prisma.networkBan.count({ where: { value: { in: [old, forever] } } })).toBe(1);
  });
});
