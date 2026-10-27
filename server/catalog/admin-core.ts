import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { BulkCatalogInput, CardDraft, CatalogError, RarityDraft } from "@/lib/catalog/admin-form";
import { validateVariant } from "@/lib/catalog/variants";
import { buildSearchText } from "@/lib/catalog/search";
import { parseSetting } from "@/lib/settings/defaults";
import { filterContext } from "@/lib/boosters/pool-filter";
import { recomputeBoosterPools } from "../boosters/type-store";
import { writeAdminLog } from "../admin/log";
import { canDeleteCatalogCard, canEditCatalogCard, type CatalogScope } from "@/lib/admin/roles";

export class CatalogMutationError extends Error {
  constructor(readonly code: CatalogError) { super(code); }
}
const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;

/** Catalogue, pools and audit commit together. Revision lock serializes publication and imports. */
export async function lockCatalog(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(740_210_001)`;
}
export async function bumpCatalogRevision(tx: Prisma.TransactionClient) {
  await tx.gameSetting.upsert({ where: { key: "catalog.revision" }, create: { key: "catalog.revision", value: Date.now() }, update: { value: Date.now() } });
}
async function updatePools(tx: Prisma.TransactionClient) {
  const tz = await tx.gameSetting.findUnique({ where: { key: "game.timeZone" } });
  await recomputeBoosterPools(tx, filterContext(new Date(), parseSetting("game.timeZone", tz?.value)));
  await bumpCatalogRevision(tx);
}

export async function saveCatalogCardWith(db: PrismaClient, adminId: string, draft: CardDraft, scope: CatalogScope = "full") {
  return db.$transaction(async (tx) => {
    await lockCatalog(tx);
    const before = draft.id ? await tx.card.findUnique({ where: { id: draft.id } }) : null;
    if (draft.id && !before) throw new CatalogMutationError("NOT_FOUND");
    if (before && before.updatedAt.toISOString() !== draft.updatedAt) throw new CatalogMutationError("CONFLICT");
    // DEV : brouillon jamais distribué (ni exemplaire ni découverte, cas d'une carte restaurée), revérifié sous le verrou
    const copies = before && scope !== "full"
      ? (await Promise.all([tx.userCard.count({ where: { cardId: before.id } }), tx.discovery.count({ where: { cardId: before.id } })])).reduce((a, b) => a + b, 0)
      : 0;
    if (!canEditCatalogCard(scope, before && { status: before.status, copies }, draft.status)) throw new CatalogMutationError("FORBIDDEN");
    const rarity = await tx.rarityDefinition.findUnique({ where: { key: draft.rarity } });
    if (!rarity) throw new CatalogMutationError("UNKNOWN_RARITY");
    const base = draft.variantOfId ? await tx.card.findUnique({ where: { id: draft.variantOfId }, select: { id: true, variantOfId: true, imageUrl: true } }) : null;
    const variantError = validateVariant({ id: draft.id, variantOfId: draft.variantOfId, imageUrl: draft.imageUrl }, base, rarity.variantRequired);
    if (variantError) throw new CatalogMutationError(variantError);
    // Une carte qui a déjà des variantes reste une base : pas de chaîne.
    if (before && draft.variantOfId && await tx.card.count({ where: { variantOfId: before.id } })) throw new CatalogMutationError("VARIANT_INVALID");
    const boosterIds = [...new Set(draft.boosterIds)];
    if (await tx.boosterType.count({ where: { id: { in: boosterIds } } }) !== boosterIds.length) throw new CatalogMutationError("UNKNOWN_BOOSTER");
    const series = draft.newSeries ? await tx.series.create({ data: {
      titleRomaji: draft.newSeries.title, titleEnglish: draft.newSeries.titleEnglish || null,
      type: draft.newSeries.type, genres: draft.newSeries.genres, tags: draft.newSeries.tags,
      year: draft.newSeries.year ?? null, season: draft.newSeries.season ?? null,
      seasonYear: draft.newSeries.seasonYear ?? null, studio: draft.newSeries.studio || null,
    } }) : await tx.series.findUnique({ where: { id: draft.seriesId! } });
    if (!series) throw new CatalogMutationError("INVALID");
    const data = {
      name: draft.name, nameNative: draft.nameNative || null, imageUrl: draft.imageUrl,
      description: json(draft.description), appearance: json(draft.appearance), rarity: draft.rarity,
      power: draft.power, ki: draft.ki, dropWeight: draft.dropWeight, status: draft.status,
      seriesId: series.id, boosterIds, gender: draft.gender || null, role: draft.role,
      birthMonth: draft.birthMonth, birthDay: draft.birthDay,
      variantOfId: draft.variantOfId, formName: draft.formName || null,
      searchText: buildSearchText([draft.name, draft.nameNative, draft.formName, series.titleRomaji, series.titleEnglish, series.titleNative]),
    };
    const overrides = before ? [...new Set([...before.adminOverrides, ...Object.keys(data).filter((key) => JSON.stringify(before[key as keyof typeof before]) !== JSON.stringify(data[key as keyof typeof data]))])] : [];
    const after = before ? await tx.card.update({ where: { id: before.id }, data: { ...data, adminOverrides: overrides } }) :
      await tx.card.create({ data: { ...data, origin: "CUSTOM", favorites: 0 } });
    await writeAdminLog(tx, { adminId, action: before ? "CARD_UPDATE" : "CARD_CREATE", targetType: "Card", targetId: after.id,
      before: before ? json(before) : undefined, after: json(after) });
    await updatePools(tx);
    return { id: after.id, updatedAt: after.updatedAt.toISOString(), seriesId: series.id };
  }, { timeout: 60_000, maxWait: 10_000 });
}

export async function setCatalogCardStatusWith(db: PrismaClient, adminId: string, id: string, updatedAt: string, status: "ARCHIVED" | "DRAFT") {
  return db.$transaction(async (tx) => {
    await lockCatalog(tx);
    const before = await tx.card.findUnique({ where: { id } });
    if (!before) throw new CatalogMutationError("NOT_FOUND");
    if (before.updatedAt.toISOString() !== updatedAt) throw new CatalogMutationError("CONFLICT");
    const after = await tx.card.update({ where: { id }, data: { status, adminOverrides: [...new Set([...before.adminOverrides, "status"])] } });
    await writeAdminLog(tx, { adminId, action: status === "ARCHIVED" ? "CARD_ARCHIVE" : "CARD_RESTORE", targetType: "Card", targetId: id, before: json(before), after: json(after) });
    await updatePools(tx);
    return { id, updatedAt: after.updatedAt.toISOString() };
  }, { timeout: 60_000, maxWait: 10_000 });
}

type BulkUpdate = { status?: "PUBLISHED" | "ARCHIVED" | "DRAFT"; rarity?: string; boosterIds?: string[] };

/** Actions groupées : mêmes règles que l'édition unitaire, une transaction, un recalcul des pools. */
export async function bulkCatalogWith(db: PrismaClient, adminId: string, input: BulkCatalogInput) {
  return db.$transaction(async (tx) => {
    await lockCatalog(tx);
    const ids = [...new Set(input.ids)];
    const [cards, definitions] = await Promise.all([tx.card.findMany({ where: { id: { in: ids } } }), tx.rarityDefinition.findMany()]);
    const definition = (key: string) => definitions.find((d) => d.key === key);
    if (input.action === "setRarity" && !definition(input.rarity!)) throw new CatalogMutationError("UNKNOWN_RARITY");
    if (input.boosterId && !await tx.boosterType.findUnique({ where: { id: input.boosterId }, select: { id: true } })) throw new CatalogMutationError("UNKNOWN_BOOSTER");
    const baseIds = [...new Set(cards.map((c) => c.variantOfId).filter((v): v is string => Boolean(v)))];
    const bases = new Map((await tx.card.findMany({ where: { id: { in: baseIds } }, select: { id: true, variantOfId: true, imageUrl: true } })).map((b) => [b.id, b]));
    const rejected: { id: string; error: CatalogError }[] = [];
    let updated = 0;
    for (const id of ids) {
      const card = cards.find((c) => c.id === id);
      if (!card) { rejected.push({ id, error: "NOT_FOUND" }); continue; }
      let data: BulkUpdate;
      switch (input.action) {
        case "publish": data = { status: "PUBLISHED" }; break;
        case "archive": data = { status: "ARCHIVED" }; break;
        case "restore": data = { status: "DRAFT" }; break;
        case "setRarity": data = { rarity: input.rarity }; break;
        case "addBooster": data = { boosterIds: [...new Set([...card.boosterIds, input.boosterId!])] }; break;
        case "removeBooster": data = { boosterIds: card.boosterIds.filter((b) => b !== input.boosterId) }; break;
      }
      if (input.action === "restore" && card.status !== "ARCHIVED") continue;
      if (input.action === "publish" && !card.imageUrl) { rejected.push({ id, error: "IMAGE_REQUIRED" }); continue; }
      if (input.action === "publish" || input.action === "setRarity") {
        const target = definition(data.rarity ?? card.rarity);
        const error = validateVariant(card, card.variantOfId ? bases.get(card.variantOfId) ?? null : null, Boolean(target?.variantRequired));
        if (error) { rejected.push({ id, error }); continue; }
      }
      const changed = (Object.keys(data) as (keyof BulkUpdate)[]).filter((key) => JSON.stringify(card[key]) !== JSON.stringify(data[key]));
      if (!changed.length) continue;
      const after = await tx.card.update({ where: { id }, data: { ...data, adminOverrides: [...new Set([...card.adminOverrides, ...changed])] } });
      await writeAdminLog(tx, { adminId, action: `CARD_BULK_${input.action.toUpperCase()}`, targetType: "Card", targetId: id, before: json(card), after: json(after) });
      updated++;
    }
    if (updated) await updatePools(tx);
    return { updated, rejected };
  }, { timeout: 60_000, maxWait: 10_000 });
}

/**
 * Suppression définitive d'une création originale jamais publiée ni distribuée.
 * Tout ce qui a touché un joueur (exemplaire, tirage, cadeau, vente, échange…) impose l'archivage.
 */
export async function deleteCatalogCardWith(db: PrismaClient, adminId: string, id: string, updatedAt: string, scope: CatalogScope = "full") {
  return db.$transaction(async (tx) => {
    await lockCatalog(tx);
    const before = await tx.card.findUnique({ where: { id }, include: { _count: { select: {
      copies: true, discoveries: true, wishedBy: true, lotItems: true, auctions: true, notablePulls: true,
      tradesWanted: true, tradesChosen: true, tradeOffers: true, variants: true,
    } } } });
    if (!before) throw new CatalogMutationError("NOT_FOUND");
    if (before.updatedAt.toISOString() !== updatedAt) throw new CatalogMutationError("CONFLICT");
    const { _count: counts, ...card } = before;
    if (!canDeleteCatalogCard(scope, card.status)) throw new CatalogMutationError("FORBIDDEN");
    if (!deletableCard(card, counts)) throw new CatalogMutationError("IN_USE");
    const [openings, gifts, boosters, teams] = await Promise.all([
      tx.boosterOpening.count({ where: { catalogCardIds: { has: id } } }), tx.gift.count({ where: { cardId: id } }),
      tx.boosterType.count({ where: { featuredCardIds: { has: id } } }), tx.user.count({ where: { battleTeam: { has: id } } }),
    ]);
    if (openings + gifts + boosters + teams) throw new CatalogMutationError("IN_USE");
    await tx.card.delete({ where: { id } });
    await writeAdminLog(tx, { adminId, action: "CARD_DELETE", targetType: "Card", targetId: id, before: json(card) });
    await updatePools(tx);
    return { id, updatedAt: new Date().toISOString() };
  }, { timeout: 60_000, maxWait: 10_000 });
}

/** Contrôle rapide (liste, éditeur) ; la transaction de suppression revérifie tout. */
export function deletableCard(card: { origin: string; status: string }, counts: Record<string, number>) {
  return card.origin === "CUSTOM" && card.status !== "PUBLISHED" && Object.values(counts).every((n) => n === 0);
}

export async function saveRarityWith(db: PrismaClient, adminId: string, input: RarityDraft) {
  return db.$transaction(async (tx) => {
    await lockCatalog(tx);
    const before = await tx.rarityDefinition.findUnique({ where: { key: input.key } });
    if (input.create && before) throw new CatalogMutationError("KEY_TAKEN");
    if (!input.create && !before) throw new CatalogMutationError("NOT_FOUND");
    if (before && before.updatedAt.toISOString() !== input.updatedAt) throw new CatalogMutationError("CONFLICT");
    const template = await tx.rarityDefinition.findUnique({ where: { key: input.template } });
    if (!template) throw new CatalogMutationError("UNKNOWN_RARITY");
    const data = { nameFr: input.nameFr, nameEn: input.nameEn, seal: input.seal, sortOrder: input.sortOrder, appearance: json(input.appearance),
      variantRequired: Boolean(input.variantRequired) };
    const after = await tx.rarityDefinition.upsert({ where: { key: input.key }, create: { key: input.key, legacyBase: template.legacyBase, ...data }, update: data });
    for (const [key, value] of [
      ["booster.rates", input.rate], ["collection.recycleValues", input.recycleValue], ["battle.keywordsByRarity", input.keywords],
    ] as const) {
      const row = await tx.gameSetting.findUnique({ where: { key } });
      const next = { ...parseSetting(key, row?.value), [input.key]: value };
      if (key === "booster.rates" && !Object.values(next).some((v) => v > 0)) throw new CatalogMutationError("INVALID");
      await tx.gameSetting.upsert({ where: { key }, create: { key, value: next, updatedBy: adminId }, update: { value: next, updatedBy: adminId } });
      await writeAdminLog(tx, { adminId, action: "SETTING_UPDATE", targetType: "GameSetting", targetId: key, before: json(row?.value ?? {}), after: json(next) });
    }
    for (const [key, enabled] of [["gifts.allowedRarities", input.gifts], ["trades.allowedRarities", input.trades]] as const) {
      const row = await tx.gameSetting.findUnique({ where: { key } });
      const next = [...parseSetting(key, row?.value).filter((r) => r !== input.key), ...(enabled ? [input.key] : [])];
      await tx.gameSetting.upsert({ where: { key }, create: { key, value: next, updatedBy: adminId }, update: { value: next, updatedBy: adminId } });
      await writeAdminLog(tx, { adminId, action: "SETTING_UPDATE", targetType: "GameSetting", targetId: key, before: json(row?.value ?? []), after: next });
    }
    await writeAdminLog(tx, { adminId, action: input.create ? "RARITY_CREATE" : "RARITY_UPDATE", targetType: "RarityDefinition", targetId: input.key,
      before: before ? json(before) : undefined, after: json(after) });
    await updatePools(tx);
    return { id: after.key, updatedAt: after.updatedAt.toISOString() };
  }, { timeout: 60_000, maxWait: 10_000 });
}
