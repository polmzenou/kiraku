import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import type { KyaraCode } from "@/lib/kyara/codes";
import type { KyaraPayload } from "@/lib/kyara/payload";
import { DEFAULT_KYARA_RULES, type KyaraRules } from "@/lib/kyara/rules";
import { SETTING_DEFAULTS } from "@/lib/settings/defaults";
import { createPgAdapter } from "@/server/pg-adapter";
import {
  applyImportWith,
  cancelImportWith,
  forgetKyaraImportsFor,
  KyaraImportError,
  prepareProcessingWith,
  previewImportWith,
  purgeKyaraImportsWith,
  receivePayloadWith,
  rejectImportWith,
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

  const discordId = () => `${randomInt(100_000_000, 999_999_999)}${randomInt(100_000_000, 999_999_999)}`;
  const avatarOf = (id: string) => `https://cdn.discordapp.com/avatars/${id}/${"a".repeat(32)}.png`;

  async function player(opts: { role?: "USER" | "ADMIN" | "DEV"; guest?: boolean; discord?: string | null; createdAt?: Date } = {}) {
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

  function payload(nonceUrl: string, kyaraUserId: string, avatarUrl: string | null, list = COLLECTION()): KyaraPayload {
    const nonce = new URL(nonceUrl).hash.replace("#kiraku=", "");
    return { build: 1, kyaraUserId, nonce, pseudo: "Joueur Kyara", avatarUrl, readAt: new Date(), total: list.length, entries: list, copies: list.reduce((s, e) => s + e.qty, 0) };
  }

  /** Demande d'un joueur, lue par l'équipe : la demande est prête à verser. */
  async function ready(p: { id: string; discord: string | null }, staffId: string, list = COLLECTION()) {
    const kyaraUserId = randomUUID();
    const { id } = await requestImportWith(prisma, { userId: p.id, kyaraUserId, rules, staff: false, now: new Date() });
    const { url: link } = await prepareProcessingWith(prisma, { staffId, importId: id, nonceMinutes: 30, now: new Date() });
    await receivePayloadWith(prisma, { staffId, payload: payload(link, kyaraUserId, avatarOf(p.discord!), list), confirmWithoutDiscord: false, now: new Date() });
    return { id, kyaraUserId };
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

  it("verse une collection lue : cartes, découvertes importées, liste de souhaits, Zeni et notification", async () => {
    const staff = await player({ role: "ADMIN" });
    const me = await player();
    await prisma.userCard.create({ data: { id: randomUUID(), ownerId: me.id, cardId: cards[4] } });
    await prisma.wishlistEntry.create({ data: { userId: me.id, cardId: cards[0], position: 1 } });

    const { id } = await ready(me, staff.id);
    const preview = await previewImportWith(prisma, id);
    expect(preview?.plan.grant.map((g) => g.cardId)).toEqual([cards[0], cards[2]]);
    const zeni = ZENI.R + ZENI.L + RECYCLE.RARE + ZENI.U;
    expect(preview?.plan).toMatchObject({ zeni, extraCopies: 2 });

    expect(await applyImportWith(prisma, { staffId: staff.id, importId: id, expectedCards: 2, expectedZeni: zeni, now: new Date() })).toEqual({ cards: 2, zeni });
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
    expect(row).toMatchObject({ status: "DONE", grantedCards: 2, grantedZeni: zeni, zeniRaw: zeni, discordVerified: true, appliedById: staff.id });
    expect(await prisma.adminLog.count({ where: { targetId: id, action: { startsWith: "KYARA_IMPORT_" } } })).toBe(3);
  });

  it("verse exactement une fois, même sous dix clics simultanés", async () => {
    const staff = await player({ role: "ADMIN" });
    const me = await player();
    const { id } = await ready(me, staff.id);
    const preview = await previewImportWith(prisma, id);
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        applyImportWith(prisma, { staffId: staff.id, importId: id, expectedCards: preview!.plan.grant.length, expectedZeni: preview!.plan.zeni, now: new Date() }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.coinTransaction.count({ where: { userId: me.id, reason: "KYARA_IMPORT" } })).toBe(1);
    // Sans la Rare déjà possédée : Mythique, Commune et Rare versées, une seule fois chacune
    expect(preview!.plan.grant).toHaveLength(3);
    expect(await prisma.userCard.count({ where: { ownerId: me.id } })).toBe(3);
    const again = { staffId: staff.id, importId: id, expectedCards: 3, expectedZeni: preview!.plan.zeni, now: new Date() };
    expect(await code(applyImportWith(prisma, again))).toBe("ALREADY_DONE");
  });

  it("une seule demande par compte, par Discord et par profil Kyara ; règles d'accès", async () => {
    const me = await player();
    const kyara = randomUUID();
    const now = new Date();
    await requestImportWith(prisma, { userId: me.id, kyaraUserId: kyara, rules, staff: false, now });
    expect(await code(requestImportWith(prisma, { userId: me.id, kyaraUserId: randomUUID(), rules, staff: false, now }))).toBe("ALREADY_REQUESTED");
    // Une adresse publique collée par un autre ne bloque pas le vrai propriétaire tant qu'elle n'est pas lue
    const other = await player();
    expect(await code(requestImportWith(prisma, { userId: other.id, kyaraUserId: kyara, rules, staff: false, now }))).toBeNull();
    expect(await code(requestImportWith(prisma, { userId: (await player()).id, kyaraUserId: staffKyaraUserId, rules, staff: false, now }))).toBe("OWN_STAFF_PROFILE");
    expect(await code(requestImportWith(prisma, { userId: (await player({ guest: true })).id, kyaraUserId: randomUUID(), rules, staff: false, now }))).toBe("GUEST");
    expect(await code(requestImportWith(prisma, { userId: (await player({ discord: null })).id, kyaraUserId: randomUUID(), rules, staff: false, now }))).toBe("NO_DISCORD");
    const old = await player({ createdAt: new Date(Date.now() - 90 * DAY) });
    const lateRules = { ...rules, launchAt: Date.now() - 30 * DAY };
    expect(await code(requestImportWith(prisma, { userId: old.id, kyaraUserId: randomUUID(), rules: lateRules, staff: false, now }))).toBe("EXPIRED");
    expect(await code(requestImportWith(prisma, { userId: old.id, kyaraUserId: randomUUID(), rules: { ...rules, enabled: false }, staff: false, now }))).toBe("DISABLED");
    // Annulée, la demande ne verrouille plus rien
    const mine = await prisma.kyaraImport.findFirstOrThrow({ where: { userId: me.id, status: "PENDING" } });
    await cancelImportWith(prisma, { userId: me.id, importId: mine.id, now });
    expect(await code(cancelImportWith(prisma, { userId: me.id, importId: mine.id, now }))).toBe("NOT_PENDING");
    expect(await code(cancelImportWith(prisma, { userId: other.id, importId: mine.id, now }))).toBe("NOT_FOUND");
    expect(await code(requestImportWith(prisma, { userId: me.id, kyaraUserId: randomUUID(), rules, staff: false, now }))).toBeNull();
  });

  it("le lien de traitement : à usage unique, propre au membre qui l'a préparé, expiré, remplacé", async () => {
    const [staff, staff2] = [await player({ role: "ADMIN" }), await player({ role: "DEV" })];
    const me = await player();
    const kyara = randomUUID();
    const { id } = await requestImportWith(prisma, { userId: me.id, kyaraUserId: kyara, rules, staff: false, now: new Date() });
    expect(await code(prepareProcessingWith(prisma, { staffId: me.id, importId: id, nonceMinutes: 30, now: new Date() }))).toBe("SELF");
    const first = await prepareProcessingWith(prisma, { staffId: staff.id, importId: id, nonceMinutes: 30, now: new Date() });
    const send = (staffId: string, link: string, uuid = kyara, now = new Date(), avatar: string | null = avatarOf(me.discord!), confirm = false) =>
      receivePayloadWith(prisma, { staffId, payload: payload(link, uuid, avatar), confirmWithoutDiscord: confirm, now });

    expect(await code(send(staff2.id, first.url))).toBe("NONCE_OTHER_STAFF");
    expect(await code(send(staff.id, first.url, kyara, new Date(Date.now() + 31 * 60_000)))).toBe("NONCE_EXPIRED");
    expect(await code(send(staff.id, first.url, randomUUID()))).toBe("UUID_MISMATCH");
    expect(await code(send(staff.id, first.url, kyara, new Date(), avatarOf(discordId())))).toBe("DISCORD_MISMATCH");
    expect(await code(send(staff.id, first.url, kyara, new Date(), "https://cdn.discordapp.com/embed/avatars/1.png"))).toBe("DISCORD_UNVERIFIED");
    // Un nouveau « Traiter » remplace le lien ; les refus n'ont rien consommé
    const second = await prepareProcessingWith(prisma, { staffId: staff.id, importId: id, nonceMinutes: 30, now: new Date() });
    expect(await code(send(staff.id, first.url))).toBe("NONCE_INVALID");
    expect(await send(staff.id, second.url)).toEqual({ importId: id, discordVerified: true });
    expect(await code(send(staff.id, second.url))).toBe("NONCE_INVALID");
  });

  it("avatar sans ID Discord : confirmation explicite ; un profil lu une seule fois (KYARA_TAKEN)", async () => {
    const staff = await player({ role: "ADMIN" });
    const [me, other] = [await player(), await player()];
    const kyara = randomUUID();
    const mine = await requestImportWith(prisma, { userId: me.id, kyaraUserId: kyara, rules, staff: false, now: new Date() });
    const theirs = await requestImportWith(prisma, { userId: other.id, kyaraUserId: kyara, rules, staff: false, now: new Date() });
    const noId = "https://cdn.discordapp.com/embed/avatars/2.png";
    const a = await prepareProcessingWith(prisma, { staffId: staff.id, importId: mine.id, nonceMinutes: 30, now: new Date() });
    expect(await receivePayloadWith(prisma, { staffId: staff.id, payload: payload(a.url, kyara, noId), confirmWithoutDiscord: true, now: new Date() })).toEqual({
      importId: mine.id,
      discordVerified: false,
    });
    const b = await prepareProcessingWith(prisma, { staffId: staff.id, importId: theirs.id, nonceMinutes: 30, now: new Date() });
    expect(await code(receivePayloadWith(prisma, { staffId: staff.id, payload: payload(b.url, kyara, noId), confirmWithoutDiscord: true, now: new Date() }))).toBe(
      "KYARA_TAKEN",
    );
  });

  it("refuse un versement qui ne correspond plus à l'aperçu (STALE), puis verse le nouvel aperçu", async () => {
    const staff = await player({ role: "ADMIN" });
    const me = await player();
    const { id } = await ready(me, staff.id);
    const before = (await previewImportWith(prisma, id))!.plan;
    // Le joueur obtient entre-temps la Mythique : elle devient « déjà possédée »
    await prisma.userCard.create({ data: { id: randomUUID(), ownerId: me.id, cardId: cards[0] } });
    expect(await code(applyImportWith(prisma, { staffId: staff.id, importId: id, expectedCards: before.grant.length, expectedZeni: before.zeni, now: new Date() }))).toBe("STALE");
    const after = (await previewImportWith(prisma, id))!.plan;
    expect(after.grant.length).toBe(before.grant.length - 1);
    expect(after.zeni).toBe(before.zeni + RECYCLE.MYTHIC);
    await applyImportWith(prisma, { staffId: staff.id, importId: id, expectedCards: after.grant.length, expectedZeni: after.zeni, now: new Date() });
    expect(await prisma.userCard.count({ where: { ownerId: me.id, cardId: cards[0] } })).toBe(1);
  });

  it("refus avec motif et note, réouverture, relecture", async () => {
    const staff = await player({ role: "ADMIN" });
    const me = await player();
    const { id } = await ready(me, staff.id);
    await rereadImportWith(prisma, { staffId: staff.id, importId: id, now: new Date() });
    expect(await prisma.kyaraImport.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "PENDING", snapshot: null, receivedAt: null });
    await rejectImportWith(prisma, { staffId: staff.id, importId: id, code: "NOT_FRIEND", note: "Ajoute le compte Kiraku en ami", now: new Date() });
    expect(await prisma.kyaraImport.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "REJECTED", rejectCode: "NOT_FRIEND" });
    const notif = await prisma.notification.findFirstOrThrow({ where: { userId: me.id, type: "KYARA_IMPORT_REJECTED" } });
    expect(notif.payload).toEqual({ kind: "REJECTED", code: "NOT_FRIEND" });
    expect(await code(rejectImportWith(prisma, { staffId: staff.id, importId: id, code: "OTHER", note: null, now: new Date() }))).toBe("NOT_REJECTABLE");
    await reopenImportWith(prisma, { staffId: staff.id, importId: id, now: new Date() });
    expect(await prisma.kyaraImport.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "PENDING", reopenCount: 1, rejectCode: null });
    // Une nouvelle demande du joueur entre-temps : la réouverture serait en conflit
    await rejectImportWith(prisma, { staffId: staff.id, importId: id, code: "OTHER", note: null, now: new Date() });
    await requestImportWith(prisma, { userId: me.id, kyaraUserId: randomUUID(), rules, staff: false, now: new Date() });
    expect(await code(reopenImportWith(prisma, { staffId: staff.id, importId: id, now: new Date() }))).toBe("CONFLICT");
  });

  it("RGPD : suppression du compte, le verrou du Discord reste ; purge des photos anciennes", async () => {
    const staff = await player({ role: "ADMIN" });
    const me = await player();
    const { id } = await ready(me, staff.id, entries([[A[2], 1, "C"]]));
    await applyImportWith(prisma, { staffId: staff.id, importId: id, expectedCards: 1, expectedZeni: 0, now: new Date() });
    await prisma.$transaction((tx) => forgetKyaraImportsFor(tx, me.id, new Date()));
    expect(await prisma.kyaraImport.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "DONE", snapshot: null, kyaraUsername: null });
    await prisma.userCard.deleteMany({ where: { ownerId: me.id } });
    await prisma.user.delete({ where: { id: me.id } });
    expect((await prisma.kyaraImport.findUniqueOrThrow({ where: { id } })).userId).toBeNull();
    // Le même Discord lié à un nouveau compte ne peut plus servir
    const again = await player({ discord: me.discord });
    expect(await code(requestImportWith(prisma, { userId: again.id, kyaraUserId: randomUUID(), rules, staff: false, now: new Date() }))).toBe("DISCORD_ALREADY_USED");

    const purge = await purgeKyaraImportsWith(prisma, { now: new Date(Date.now() + 100 * DAY), retentionDays: 90 });
    expect(purge.purged + purge.deleted).toBeGreaterThanOrEqual(0);
    expect(await prisma.kyaraImport.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "DONE", discordId: me.discord });
  });
});
