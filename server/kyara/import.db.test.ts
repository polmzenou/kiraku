import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import type { KyaraCode } from "@/lib/kyara/codes";
import type { KyaraPayload } from "@/lib/kyara/payload";
import type { KyaraEntry } from "@/lib/kyara/plan";
import { DEFAULT_KYARA_RULES, type KyaraRules } from "@/lib/kyara/rules";
import { SETTING_DEFAULTS } from "@/lib/settings/defaults";
import { createPgAdapter } from "@/server/pg-adapter";
import {
  applyImportWith,
  cancelImportWith,
  forgetKyaraImportsFor,
  issueStaffKeyWith,
  KyaraImportError,
  previewImportWith,
  purgeKyaraImportsWith,
  receivePayloadWith,
  rejectImportWith,
  remindImportWith,
  reopenImportWith,
  requestImportWith,
  rereadImportWith,
} from "./import-core";

vi.mock("server-only", () => ({}));

// Import Kyara sur une vraie base (base de test isolée) : sauté sans DATABASE_URL_TEST.
//   DATABASE_URL_TEST="postgresql://…" npx vitest run server/kyara/import.db.test.ts
// Série, cartes et joueurs jetables, supprimés à la fin avec leurs demandes.

const url = process.env.DATABASE_URL_TEST;
const DAY = 86_400_000;
const ZENI = SETTING_DEFAULTS["kyaraImport.zeniByRarity"];
const RECYCLE = SETTING_DEFAULTS["collection.recycleValues"];

describe.skipIf(!url)("import Kyara (base réelle)", () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  const tag = randomBytes(4).toString("hex");
  const seriesId = `test-series-kyara-${tag}`;
  const base = 900_000_000 + randomInt(0, 50_000_000);
  // Personnages : 0 Mythique, 1 Épique, 2 Commune, 3 Légendaire en brouillon, 4 Rare (déjà possédée), 5 absent
  const A = [0, 1, 2, 3, 4, 5].map((i) => base + i);
  const cards = [0, 1, 2, 3, 4].map((i) => `test-card-kyara-${tag}-${i}`);
  const users: string[] = [];
  const discords: string[] = [];
  const staffKyaraUserId = randomUUID();
  const rules: KyaraRules = { ...DEFAULT_KYARA_RULES, enabled: true, launchAt: Date.now() - DAY, staffKyaraUserId };
  const NO_ID = "https://cdn.discordapp.com/embed/avatars/2.png";

  const discordId = () => `${randomInt(100_000_000, 999_999_999)}${randomInt(100_000_000, 999_999_999)}`;
  const avatarOf = (id: string) => `https://cdn.discordapp.com/avatars/${id}/${"a".repeat(32)}.png`;

  type Player = { id: string; discord: string | null };

  async function player(opts: { role?: "USER" | "ADMIN" | "DEV"; guest?: boolean; discord?: string | null; createdAt?: Date } = {}): Promise<Player> {
    const user = await prisma.user.create({
      data: {
        username: `ky-${randomBytes(4).toString("hex")}`,
        role: opts.role ?? "USER",
        isGuest: opts.guest ?? false,
        ...(opts.createdAt ? { createdAt: opts.createdAt, registeredAt: opts.createdAt } : {}),
      },
    });
    users.push(user.id);
    const discord = opts.discord === undefined ? discordId() : opts.discord;
    if (discord) {
      discords.push(discord);
      await prisma.account.create({ data: { userId: user.id, type: "oauth", provider: "discord", providerAccountId: discord } });
    }
    return { id: user.id, discord };
  }

  /** Membre de l'équipe avec la clé de son favori. */
  async function staffMember(role: "ADMIN" | "DEV" = "ADMIN") {
    const p = await player({ role });
    return { ...p, key: await issueStaffKeyWith(prisma, { staffId: p.id, now: new Date() }) };
  }

  const code = async (p: Promise<unknown>) => {
    try {
      await p;
      return null;
    } catch (e) {
      return e instanceof KyaraImportError ? e.code : String(e);
    }
  };

  const entries = (list: [number, number, KyaraCode][]) => list.map(([anilistId, qty, c]) => ({ anilistId, qty, code: c }));
  /** La collection de référence : une carte de chaque issue. */
  const COLLECTION = () =>
    entries([
      [A[0], 1, "M"], // CARD
      [A[1], 1, "R"], // ABOVE (Épique chez nous)
      [A[2], 3, "C"], // CARD, deux copies en plus
      [A[3], 1, "L"], // UNPUBLISHED
      [A[4], 1, "E"], // OWNED (Rare déjà possédée)
      [A[5], 1, "U"], // MISSING
    ]);

  /** Lot du favori 4 (lecture complète, rien d'écarté) ; `old` : favori 3, qui ne dit rien de la complétude. */
  function payload(o: { key: string; avatarUrl: string | null; kyaraUserId?: string; list?: KyaraEntry[]; total?: number | null; old?: boolean }): KyaraPayload {
    const list = o.list ?? COLLECTION();
    return {
      build: o.old ? 3 : 4,
      kyaraUserId: o.kyaraUserId ?? randomUUID(),
      key: o.key,
      pseudo: "Joueur Kyara",
      avatarUrl: o.avatarUrl,
      readAt: new Date(),
      total: o.total === undefined ? list.length : o.total,
      entries: list,
      copies: list.reduce((s, e) => s + e.qty, 0),
      complete: o.old ? null : true,
      dropped: o.old ? null : 0,
      idFallbacks: o.old ? null : 0,
    };
  }

  const NO_CAPS = { maxCards: 0, maxZeni: 0 };

  const receive = (staffId: string, p: KyaraPayload, opts: { importId?: string; confirm?: boolean; now?: Date; caps?: typeof NO_CAPS; keyDays?: number } = {}) =>
    receivePayloadWith(prisma, {
      staffId,
      payload: p,
      importId: opts.importId ?? null,
      confirmWithoutDiscord: opts.confirm ?? false,
      staffKyaraUserId,
      autoCaps: opts.caps ?? NO_CAPS,
      staffKeyDays: opts.keyDays ?? 0,
      now: opts.now ?? new Date(),
    });

  const apply = (staffId: string, importId: string, expected: { cards: number; zeni: number }, caps = NO_CAPS) =>
    applyImportWith(prisma, { staffId, importId, expectedCards: expected.cards, expectedZeni: expected.zeni, autoCaps: caps, now: new Date() });

  const request = (p: Player, r: KyaraRules = rules) => requestImportWith(prisma, { userId: p.id, rules: r, staff: false, now: new Date() });

  /** Demande lue mais laissée à l'équipe (lecture incomplète) : prête à verser après l'aperçu. */
  async function ready(p: Player, staff: { id: string; key: string }, list = COLLECTION()) {
    const { id } = await request(p);
    const res = await receive(staff.id, payload({ key: staff.key, avatarUrl: avatarOf(p.discord!), list, total: list.length + 5 }));
    expect(res).toMatchObject({ status: "READY", importId: id, reason: "TRUNCATED" });
    return { id };
  }

  beforeAll(async () => {
    await prisma.series.create({ data: { id: seriesId, type: "ANIME", titleRomaji: "Import Kyara" } });
    const rarity = ["MYTHIC", "EPIC", "COMMON", "LEGENDARY", "RARE"];
    // Une carte AniList est publiée si elle a un rang (trigger catalog_sync_card_identity), sauf statut forcé
    const rankBase = 10_000_000 + randomInt(0, 50_000_000);
    await prisma.card.createMany({
      data: cards.map((id, i) => ({
        id,
        anilistId: A[i],
        rank: rankBase + i,
        name: `Kyara ${i}`,
        imageUrl: "",
        favorites: 0,
        power: 10,
        ki: 10,
        seriesId,
        searchText: `kyara ${i}`,
        rarity: rarity[i],
        ...(i === 3 ? { status: "DRAFT" as const, adminOverrides: ["status"] } : {}),
      })),
    });
  }, 30_000);

  afterAll(async () => {
    const where = { userId: { in: users } };
    await prisma.$transaction([
      // Un import versé garde son Discord après la suppression du compte : supprimé par son Discord
      prisma.kyaraImport.deleteMany({ where: { OR: [{ userId: { in: users } }, { discordId: { in: discords } }] } }),
      prisma.notification.deleteMany({ where }),
      prisma.adminLog.deleteMany({ where: { adminId: { in: users } } }),
      prisma.coinTransaction.deleteMany({ where }),
      prisma.discovery.deleteMany({ where }),
      prisma.wishlistEntry.deleteMany({ where }),
      prisma.userCard.deleteMany({ where: { ownerId: { in: users } } }),
      prisma.user.deleteMany({ where: { id: { in: users } } }),
      prisma.card.deleteMany({ where: { id: { in: cards } } }),
      prisma.series.deleteMany({ where: { id: seriesId } }),
    ]);
    await prisma.$disconnect();
  }, 30_000);

  it("lecture sûre : versée dès la réception (cartes, découvertes importées, liste de souhaits, Zeni, notification)", async () => {
    const staff = await staffMember();
    const me = await player();
    await prisma.userCard.create({ data: { id: randomUUID(), ownerId: me.id, cardId: cards[4] } });
    await prisma.wishlistEntry.create({ data: { userId: me.id, cardId: cards[0], position: 1 } });
    const { id } = await request(me);
    const kyaraUserId = randomUUID();

    const zeni = ZENI.R + ZENI.L + RECYCLE.RARE + ZENI.U;
    const res = await receive(staff.id, payload({ key: staff.key, avatarUrl: avatarOf(me.discord!), kyaraUserId }));
    expect(res).toEqual({ status: "DONE", importId: id, userId: me.id, cards: 2, zeni });
    const owned = await prisma.userCard.findMany({ where: { ownerId: me.id }, select: { cardId: true, status: true } });
    expect(owned.map((c) => c.cardId).sort()).toEqual([cards[0], cards[2], cards[4]].sort());
    expect(owned.every((c) => c.status === "COLLECTION")).toBe(true);
    const found = await prisma.discovery.findMany({ where: { userId: me.id }, select: { cardId: true, imported: true } });
    expect(found.filter((d) => d.imported).map((d) => d.cardId).sort()).toEqual([cards[0], cards[2]].sort());
    expect(await prisma.wishlistEntry.count({ where: { userId: me.id } })).toBe(0);
    const ledger = await prisma.coinTransaction.findMany({ where: { userId: me.id, reason: "KYARA_IMPORT" } });
    expect(ledger).toMatchObject([{ amount: zeni, refId: id }]);
    expect(await prisma.notification.count({ where: { userId: me.id, type: "KYARA_IMPORT_DONE", refId: id } })).toBe(1);
    const row = await prisma.kyaraImport.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ status: "DONE", kyaraUserId, reviewReason: null, grantedCards: 2, grantedZeni: zeni, discordVerified: true, appliedById: staff.id });
    expect(await prisma.adminLog.count({ where: { targetId: id, action: { startsWith: "KYARA_IMPORT_" } } })).toBe(2);
    // Relancer le favori sur le même ami ne verse rien de plus
    expect(await code(receive(staff.id, payload({ key: staff.key, avatarUrl: avatarOf(me.discord!), kyaraUserId })))).toBe("ALREADY_DONE");
  });

  it("deux réceptions simultanées du même lot : versé une seule fois", async () => {
    const staff = await staffMember();
    const me = await player();
    await request(me);
    const lot = payload({ key: staff.key, avatarUrl: avatarOf(me.discord!) });
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => receive(staff.id, lot)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.coinTransaction.count({ where: { userId: me.id, reason: "KYARA_IMPORT" } })).toBe(1);
    expect(await prisma.userCard.count({ where: { ownerId: me.id } })).toBe(3);
  });

  it("lecture douteuse (incomplète, vide) : attend l'équipe, puis versée exactement une fois", async () => {
    const staff = await staffMember();
    const me = await player();
    const { id } = await ready(me, staff);
    expect(await prisma.userCard.count({ where: { ownerId: me.id } })).toBe(0);
    expect(await code(receive(staff.id, payload({ key: staff.key, avatarUrl: avatarOf(me.discord!) })))).toBe("ALREADY_READ");

    const preview = (await previewImportWith(prisma, id))!.plan;
    expect(preview.grant).toHaveLength(3);
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => apply(staff.id, id, { cards: preview.grant.length, zeni: preview.zeni })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.coinTransaction.count({ where: { userId: me.id, reason: "KYARA_IMPORT" } })).toBe(1);
    expect(await prisma.userCard.count({ where: { ownerId: me.id } })).toBe(3);
    expect(await prisma.kyaraImport.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "DONE", reviewReason: "TRUNCATED" });

    const empty = await player();
    const other = await request(empty);
    expect(await receive(staff.id, payload({ key: staff.key, avatarUrl: avatarOf(empty.discord!), list: [] }))).toMatchObject({
      status: "READY",
      importId: other.id,
      reason: "EMPTY",
    });
    // Une lecture vide ne se verse jamais : elle fermerait l'import pour toujours
    expect(await code(apply(staff.id, other.id, { cards: 0, zeni: 0 }))).toBe("EMPTY_SNAPSHOT");
    expect((await prisma.kyaraImport.findUniqueOrThrow({ where: { id: other.id } })).status).toBe("READY");
  });

  it("sans total annoncé, ou lu par un favori d'avant la version 4 : attend l'équipe", async () => {
    const staff = await staffMember();
    const [me, other] = [await player(), await player()];
    const mine = await request(me);
    expect(await receive(staff.id, payload({ key: staff.key, avatarUrl: avatarOf(me.discord!), total: null }))).toMatchObject({
      status: "READY",
      importId: mine.id,
      reason: "TOTAL_UNKNOWN",
    });
    const theirs = await request(other);
    expect(await receive(staff.id, payload({ key: staff.key, avatarUrl: avatarOf(other.discord!), old: true }))).toMatchObject({
      status: "READY",
      importId: theirs.id,
      reason: "OLD_BOOKMARKLET",
    });
    expect(await prisma.userCard.count({ where: { ownerId: { in: [me.id, other.id] } } })).toBe(0);
  });

  it("gros lot : jamais versé d'office, versé par un autre membre que celui qui l'a reçu", async () => {
    const [staff, staff2] = [await staffMember("DEV"), await staffMember("ADMIN")];
    const me = await player();
    const { id } = await request(me);
    const caps = { maxCards: 1, maxZeni: 0 };
    expect(await receive(staff.id, payload({ key: staff.key, avatarUrl: avatarOf(me.discord!) }), { caps })).toMatchObject({
      status: "READY",
      importId: id,
      reason: "LARGE",
    });
    const preview = (await previewImportWith(prisma, id))!.plan;
    expect(preview.grant).toHaveLength(3);
    const expected = { cards: preview.grant.length, zeni: preview.zeni };
    expect(await code(apply(staff.id, id, expected, caps))).toBe("SECOND_STAFF_REQUIRED");
    expect(await prisma.userCard.count({ where: { ownerId: me.id } })).toBe(0);
    expect(await apply(staff2.id, id, expected, caps)).toEqual(expected);
    expect(await prisma.kyaraImport.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "DONE", reviewReason: "LARGE", receivedById: staff.id, appliedById: staff2.id });
  });

  it("clé du favori plus vieille que staffKeyDays jours : refusée", async () => {
    const staff = await staffMember();
    const me = await player();
    await request(me);
    const lot = payload({ key: staff.key, avatarUrl: avatarOf(me.discord!) });
    expect(await code(receive(staff.id, lot, { keyDays: 30, now: new Date(Date.now() + 31 * DAY) }))).toBe("KEY_EXPIRED");
    expect(await receive(staff.id, lot, { keyDays: 30 })).toMatchObject({ status: "DONE" });
  });

  it("une seule demande par compte et par Discord ; règles d'accès", async () => {
    const me = await player();
    const now = new Date();
    await request(me);
    expect(await code(request(me))).toBe("ALREADY_REQUESTED");
    expect(await code(request(await player({ guest: true })))).toBe("GUEST");
    expect(await code(request(await player({ discord: null })))).toBe("NO_DISCORD");
    const old = await player({ createdAt: new Date(Date.now() - 90 * DAY) });
    expect(await code(request(old, { ...rules, launchAt: Date.now() - 30 * DAY }))).toBe("EXPIRED");
    expect(await code(request(old, { ...rules, enabled: false }))).toBe("DISABLED");
    // Annulée, la demande ne verrouille plus rien
    const other = await player();
    const mine = await prisma.kyaraImport.findFirstOrThrow({ where: { userId: me.id, status: "PENDING" } });
    await cancelImportWith(prisma, { userId: me.id, importId: mine.id, now });
    expect(await code(cancelImportWith(prisma, { userId: me.id, importId: mine.id, now }))).toBe("NOT_PENDING");
    expect(await code(cancelImportWith(prisma, { userId: other.id, importId: mine.id, now }))).toBe("NOT_FOUND");
    expect(await code(request(me))).toBeNull();
  });

  it("la clé du favori : propre au membre, remplacée par une nouvelle ; demande retrouvée par le Discord", async () => {
    const [staff, staff2] = [await staffMember("ADMIN"), await staffMember("DEV")];
    const noKey = await player({ role: "ADMIN" });
    const me = await player();
    const { id } = await request(me);
    const lot = (key: string, extra: Partial<Parameters<typeof payload>[0]> = {}) => payload({ key, avatarUrl: avatarOf(me.discord!), ...extra });

    expect(await code(receive(noKey.id, lot(staff.key)))).toBe("KEY_INVALID");
    expect(await code(receive(staff2.id, lot(staff.key)))).toBe("KEY_INVALID");
    const renewed = await issueStaffKeyWith(prisma, { staffId: staff.id, now: new Date() });
    expect(await code(receive(staff.id, lot(staff.key)))).toBe("KEY_INVALID");
    // Profil du compte Kiraku lui-même, Discord sans demande
    expect(await code(receive(staff.id, lot(renewed, { kyaraUserId: staffKyaraUserId })))).toBe("OWN_STAFF_PROFILE");
    expect(await code(receive(staff.id, lot(renewed, { avatarUrl: avatarOf(discordId()) })))).toBe("NO_REQUEST");
    // Un membre de l'équipe ne verse jamais sa propre demande
    await request(staff2);
    expect(await code(receive(staff2.id, payload({ key: staff2.key, avatarUrl: avatarOf(staff2.discord!) })))).toBe("SELF");
    // Les refus n'ont rien changé : la demande est toujours en attente, puis versée
    expect((await prisma.kyaraImport.findUniqueOrThrow({ where: { id } })).status).toBe("PENDING");
    expect(await receive(staff.id, lot(renewed))).toMatchObject({ status: "DONE", importId: id });
  });

  it("avatar sans ID Discord : demande choisie et confirmée, gardée à vérifier ; un profil lu une seule fois", async () => {
    const staff = await staffMember();
    const [me, other] = [await player(), await player()];
    const mine = await request(me);
    const theirs = await request(other);
    const kyara = randomUUID();
    const lot = payload({ key: staff.key, avatarUrl: NO_ID, kyaraUserId: kyara });

    expect(await code(receive(staff.id, lot))).toBe("DISCORD_UNVERIFIED");
    expect(await code(receive(staff.id, lot, { importId: mine.id }))).toBe("DISCORD_UNVERIFIED");
    expect(await code(receive(staff.id, payload({ key: staff.key, avatarUrl: avatarOf(discordId()) }), { importId: mine.id, confirm: true }))).toBe("DISCORD_MISMATCH");
    expect(await receive(staff.id, lot, { importId: mine.id, confirm: true })).toMatchObject({ status: "READY", importId: mine.id, reason: "DISCORD_UNVERIFIED" });
    expect(await prisma.kyaraImport.findUniqueOrThrow({ where: { id: mine.id } })).toMatchObject({ kyaraUserId: kyara, discordVerified: false });
    // Le même profil Kyara lu pour une autre demande
    expect(await code(receive(staff.id, payload({ key: staff.key, avatarUrl: avatarOf(other.discord!), kyaraUserId: kyara })))).toBe("KYARA_TAKEN");
    expect((await prisma.kyaraImport.findUniqueOrThrow({ where: { id: theirs.id } })).status).toBe("PENDING");
  });

  it("refuse un versement qui ne correspond plus à l'aperçu (STALE), puis verse le nouvel aperçu", async () => {
    const staff = await staffMember();
    const me = await player();
    const { id } = await ready(me, staff);
    const before = (await previewImportWith(prisma, id))!.plan;
    // Le joueur obtient entre-temps la Mythique : elle devient « déjà possédée »
    await prisma.userCard.create({ data: { id: randomUUID(), ownerId: me.id, cardId: cards[0] } });
    expect(await code(apply(staff.id, id, { cards: before.grant.length, zeni: before.zeni }))).toBe("STALE");
    const after = (await previewImportWith(prisma, id))!.plan;
    expect(after.grant.length).toBe(before.grant.length - 1);
    expect(after.zeni).toBe(before.zeni + RECYCLE.MYTHIC);
    await apply(staff.id, id, { cards: after.grant.length, zeni: after.zeni });
    expect(await prisma.userCard.count({ where: { ownerId: me.id, cardId: cards[0] } })).toBe(1);
  });

  it("refus avec motif et note, réouverture, relecture", async () => {
    const staff = await staffMember();
    const me = await player();
    const { id } = await ready(me, staff);
    await rereadImportWith(prisma, { staffId: staff.id, importId: id, now: new Date() });
    expect(await prisma.kyaraImport.findUniqueOrThrow({ where: { id } })).toMatchObject({
      status: "PENDING",
      snapshot: null,
      receivedAt: null,
      kyaraUserId: null,
      reviewReason: null,
    });
    await rejectImportWith(prisma, { staffId: staff.id, importId: id, code: "NOT_FRIEND", note: "Ajoute le compte Kiraku en ami", now: new Date() });
    expect(await prisma.kyaraImport.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "REJECTED", rejectCode: "NOT_FRIEND" });
    const notif = await prisma.notification.findFirstOrThrow({ where: { userId: me.id, type: "KYARA_IMPORT_REJECTED" } });
    expect(notif.payload).toEqual({ kind: "REJECTED", code: "NOT_FRIEND" });
    expect(await code(rejectImportWith(prisma, { staffId: staff.id, importId: id, code: "OTHER", note: null, now: new Date() }))).toBe("NOT_REJECTABLE");
    // Refusée : le favori ne la retrouve plus
    expect(await code(receive(staff.id, payload({ key: staff.key, avatarUrl: avatarOf(me.discord!) })))).toBe("NO_REQUEST");
    await reopenImportWith(prisma, { staffId: staff.id, importId: id, now: new Date() });
    expect(await prisma.kyaraImport.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "PENDING", reopenCount: 1, rejectCode: null });
    expect(await prisma.notification.count({ where: { userId: me.id, type: "KYARA_IMPORT_REOPENED", refId: id } })).toBe(1);

    // Refus après une lecture, puis réouverture : rien de l'ancienne lecture ne reste affiché comme actuel
    const lot = payload({ key: staff.key, avatarUrl: avatarOf(me.discord!), total: COLLECTION().length + 5 });
    expect(await receive(staff.id, lot)).toMatchObject({ status: "READY", reason: "TRUNCATED" });
    await rejectImportWith(prisma, { staffId: staff.id, importId: id, code: "SUSPECT", note: null, now: new Date() });
    await reopenImportWith(prisma, { staffId: staff.id, importId: id, now: new Date() });
    expect(await prisma.kyaraImport.findUniqueOrThrow({ where: { id } })).toMatchObject({
      status: "PENDING",
      reopenCount: 2,
      kyaraUserId: null,
      kyaraUsername: null,
      snapshotCards: null,
      discordVerified: null,
      reviewReason: null,
      readAt: null,
      receivedAt: null,
      receivedById: null,
    });
    // Une nouvelle demande du joueur entre-temps : la réouverture serait en conflit
    await rejectImportWith(prisma, { staffId: staff.id, importId: id, code: "OTHER", note: null, now: new Date() });
    await request(me);
    expect(await code(reopenImportWith(prisma, { staffId: staff.id, importId: id, now: new Date() }))).toBe("CONFLICT");
  });

  it("relance : notification au joueur et journal, seulement tant que la demande attend", async () => {
    const staff = await staffMember("DEV");
    const me = await player();
    const { id } = await request(me);
    const pushed: string[][] = [];
    const remind = (cooldownHours = 0) => remindImportWith(prisma, { staffId: staff.id, importId: id, cooldownHours, now: new Date() });
    await remindImportWith(prisma, { staffId: staff.id, importId: id, cooldownHours: 0, now: new Date() }, (ids) => pushed.push(ids));
    await remind();
    // Délai entre deux relances : refusée, rien d'envoyé
    expect(await code(remind(6))).toBe("REMIND_TOO_SOON");
    const notifs = await prisma.notification.findMany({ where: { userId: me.id, type: "KYARA_IMPORT_REMINDER" } });
    expect(notifs).toHaveLength(2);
    expect(notifs[0]).toMatchObject({ refId: id, actorId: me.id, readAt: null });
    expect(pushed).toEqual([[expect.any(String)]]);
    expect(await prisma.adminLog.count({ where: { targetId: id, action: "KYARA_IMPORT_REMIND", adminId: staff.id } })).toBe(2);
    // La demande ne bouge pas
    expect(await prisma.kyaraImport.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "PENDING", receivedAt: null });
    // Lue (à vérifier) ou refusée : plus de relance
    await receive(staff.id, payload({ key: staff.key, avatarUrl: avatarOf(me.discord!), total: COLLECTION().length + 5 }));
    expect(await code(remind())).toBe("NOT_PENDING");
    expect(await code(remindImportWith(prisma, { staffId: staff.id, importId: "inconnue", cooldownHours: 0, now: new Date() }))).toBe("NOT_FOUND");
    expect(await prisma.notification.count({ where: { userId: me.id, type: "KYARA_IMPORT_REMINDER" } })).toBe(2);
  });

  it("RGPD : suppression du compte, le verrou du Discord reste ; purge des photos anciennes", async () => {
    const staff = await staffMember();
    const me = await player();
    const { id } = await request(me);
    expect(await receive(staff.id, payload({ key: staff.key, avatarUrl: avatarOf(me.discord!), list: entries([[A[2], 1, "C"]]) }))).toMatchObject({
      status: "DONE",
      cards: 1,
      zeni: 0,
    });
    await prisma.$transaction((tx) => forgetKyaraImportsFor(tx, me.id, new Date()));
    expect(await prisma.kyaraImport.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "DONE", snapshot: null, kyaraUsername: null });
    await prisma.userCard.deleteMany({ where: { ownerId: me.id } });
    await prisma.user.delete({ where: { id: me.id } });
    expect((await prisma.kyaraImport.findUniqueOrThrow({ where: { id } })).userId).toBeNull();
    // Le même Discord lié à un nouveau compte ne peut plus servir
    const again = await player({ discord: me.discord });
    expect(await code(request(again))).toBe("DISCORD_ALREADY_USED");

    // Purgé longtemps après : l'import versé reste, avec son Discord qui verrouille
    await purgeKyaraImportsWith(prisma, { now: new Date(Date.now() + 100 * DAY), retentionDays: 90 });
    expect(await prisma.kyaraImport.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "DONE", discordId: me.discord });
  });

  it("purge : chaque ligne datée a le sort prévu (anciennes effacées ou purgées, récentes intactes, orphelines annulées)", async () => {
    const now = new Date();
    const old = new Date(now.getTime() - 120 * DAY);
    const recent = new Date(now.getTime() - 10 * DAY);
    const owner = async () => (await player()).id;
    /** Ligne posée directement, avec un Discord et un profil Kyara jetables (supprimés à la fin par afterAll). */
    const row = async (status: "PENDING" | "READY" | "DONE" | "REJECTED" | "CANCELLED", closedAt: Date | null, userId: string | null) => {
      const discord = discordId();
      discords.push(discord);
      const read = status === "READY" || status === "DONE";
      const done = status === "DONE";
      const { id } = await prisma.kyaraImport.create({
        data: {
          userId,
          discordId: discord,
          status,
          closedAt,
          kyaraUserId: read ? randomUUID() : null,
          kyaraUsername: read ? "Joueur Kyara" : null,
          kyaraAvatarUrl: read ? avatarOf(discord) : null,
          kyaraDiscordId: read ? discord : null,
          snapshot: read ? [[A[2], 1, "C"]] : undefined,
          receivedAt: read ? old : null,
          ...(done ? { appliedAt: closedAt, grantedCards: 1, grantedZeni: 0, zeniRaw: 0 } : {}),
        },
        select: { id: true },
      });
      return id;
    };
    const ids = {
      doneOld: await row("DONE", old, await owner()),
      doneRecent: await row("DONE", recent, await owner()),
      rejectedOld: await row("REJECTED", old, await owner()),
      rejectedRecent: await row("REJECTED", recent, await owner()),
      cancelledOld: await row("CANCELLED", old, await owner()),
      orphanPending: await row("PENDING", null, null),
      orphanReady: await row("READY", null, null),
      pending: await row("PENDING", null, await owner()),
    };

    await purgeKyaraImportsWith(prisma, { now, retentionDays: 90 });
    const after = new Map(
      (await prisma.kyaraImport.findMany({ where: { id: { in: Object.values(ids) } } })).map((r) => [r.id, r] as const),
    );
    // Versé ancien : photo et ce qui vient de Kyara effacés, les ids qui verrouillent restent
    expect(after.get(ids.doneOld)).toMatchObject({ status: "DONE", snapshot: null, kyaraUsername: null, kyaraAvatarUrl: null, kyaraDiscordId: null, purgedAt: now });
    expect(after.get(ids.doneOld)?.kyaraUserId).not.toBeNull();
    expect(after.get(ids.doneRecent)).toMatchObject({ status: "DONE", kyaraUsername: "Joueur Kyara", purgedAt: null });
    expect(after.get(ids.doneRecent)?.snapshot).not.toBeNull();
    // Refus et annulations anciens oubliés, récents gardés
    expect(after.has(ids.rejectedOld)).toBe(false);
    expect(after.has(ids.cancelledOld)).toBe(false);
    expect(after.get(ids.rejectedRecent)).toMatchObject({ status: "REJECTED" });
    // Demandes d'un compte supprimé : annulées, photo effacée ; celle d'un joueur reste en attente
    expect(after.get(ids.orphanPending)).toMatchObject({ status: "CANCELLED", closedAt: now });
    expect(after.get(ids.orphanReady)).toMatchObject({ status: "CANCELLED", snapshot: null });
    expect(after.get(ids.pending)).toMatchObject({ status: "PENDING", closedAt: null });
  });
});
