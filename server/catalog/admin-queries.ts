import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { parseAppearance } from "@/lib/catalog/appearance";
import { blankCard, type CardDraft } from "@/lib/catalog/admin-form";
import { parseAdminCatalogParams, type AdminCatalogParams } from "@/lib/catalog/admin-list";
import { normalizeSearch } from "@/lib/catalog/search";
import { prisma } from "../db";
import { getRarityDefinitions } from "./rarities";
import { getSetting } from "../settings";
import { deletableCard } from "./admin-core";

const PAGE_SIZE = 24;
const usage = { copies: true, discoveries: true, wishedBy: true, lotItems: true, auctions: true, notablePulls: true, tradesWanted: true, tradesChosen: true, tradeOffers: true, variants: true } as const;

export async function adminCatalogList(raw: Record<string, string | string[] | undefined>) {
  const filters = parseAdminCatalogParams(raw);
  const { q, rarity, series, status, origin, kind, sort } = filters;
  const base: Prisma.CardWhereInput = {
    ...(q && { AND: normalizeSearch(q).split(" ").filter(Boolean).map((term) => ({ searchText: { contains: term } })) }),
    ...(rarity && { rarity }), ...(series && { seriesId: series }), ...(origin && { origin }),
    ...(kind === "variants" && { variantOfId: { not: null } }), ...(kind === "bases" && { variantOfId: null }),
  };
  const where: Prisma.CardWhereInput = { ...base, ...(status && { status }) };
  const orderBy = ({
    updated: [{ updatedAt: "desc" }],
    name: [{ name: "asc" }],
    rarity: [{ rarityDefinition: { sortOrder: "desc" } }, { name: "asc" }],
    power: [{ power: "desc" }, { name: "asc" }],
    number: [{ publicId: "asc" }],
  } satisfies Record<AdminCatalogParams["sort"], Prisma.CardOrderByWithRelationInput[]>)[sort];
  const [total, grouped] = await Promise.all([prisma.card.count({ where }), prisma.card.groupBy({ by: ["status"], where: base, _count: { _all: true } })]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(pages, filters.page);
  const rows = await prisma.card.findMany({ where, orderBy: [...orderBy, { id: "asc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE,
    select: { id: true, publicId: true, name: true, nameNative: true, formName: true, imageUrl: true, appearance: true, rarity: true, rank: true, power: true, ki: true,
      status: true, origin: true, updatedAt: true, variantOfId: true, series: { select: { titleRomaji: true } }, _count: { select: usage } } });
  // Détenteurs distincts des cartes de la page (le nombre d'exemplaires vient déjà de _count.copies)
  const owned = rows.length ? await prisma.$queryRaw<{ cardId: string; owners: number }[]>`
    SELECT "cardId", COUNT(DISTINCT "ownerId")::int AS owners FROM "UserCard" WHERE "cardId" IN (${Prisma.join(rows.map((r) => r.id))}) GROUP BY "cardId"` : [];
  const owners = new Map(owned.map((o) => [o.cardId, o.owners]));
  const cards = rows.map(({ _count, ...c }) => ({ ...c, updatedAt: c.updatedAt.toISOString(), variants: _count.variants, copies: _count.copies, owners: owners.get(c.id) ?? 0, deletable: deletableCard(c, _count) }));
  const counts = Object.fromEntries(grouped.map((g) => [g.status, g._count._all])) as Partial<Record<"DRAFT" | "PUBLISHED" | "ARCHIVED", number>>;
  return { cards, total, page, pages, filters: { ...filters, page }, counts };
}

/** Médiane de puissance et de ki des cartes publiées, par rareté : suggestion dans l'éditeur, rien en dur. */
async function statMedians() {
  const rows = await prisma.$queryRaw<{ rarity: string; power: number; ki: number }[]>`
    SELECT "rarityKey" AS rarity,
      round(percentile_cont(0.5) WITHIN GROUP (ORDER BY power))::int AS power,
      round(percentile_cont(0.5) WITHIN GROUP (ORDER BY ki))::int AS ki
    FROM "Card" WHERE status = 'PUBLISHED' GROUP BY "rarityKey"`;
  return Object.fromEntries(rows.map((r) => [r.rarity, { power: r.power, ki: r.ki }]));
}

export async function catalogEditorOptions() {
  const [rarities, boosters, medians] = await Promise.all([
    getRarityDefinitions(),
    prisma.boosterType.findMany({ orderBy: [{ family: "asc" }, { sortOrder: "asc" }], select: { id: true, slug: true, name: true, active: true } }),
    statMedians(),
  ]);
  return { rarities, boosters, medians, storageConfigured: Boolean(process.env.BLOB_READ_WRITE_TOKEN && process.env.BLOB_PUBLIC_HOST) };
}
export type CatalogEditorOptions = Awaited<ReturnType<typeof catalogEditorOptions>>;

const linkedSelect = { id: true, publicId: true, name: true, formName: true, imageUrl: true, rarity: true, status: true, nameNative: true, rank: true, power: true, ki: true, appearance: true } as const;
export type LinkedCard = Prisma.CardGetPayload<{ select: typeof linkedSelect }>;

/** Contexte d'une fiche : série choisie, carte de base, variantes et possibilité de suppression. */
export async function catalogEditorContext(draft: CardDraft) {
  const [series, base, card] = await Promise.all([
    draft.seriesId ? prisma.series.findUnique({ where: { id: draft.seriesId }, select: { id: true, titleRomaji: true } }) : null,
    draft.variantOfId ? prisma.card.findUnique({ where: { id: draft.variantOfId }, select: linkedSelect }) : null,
    draft.id ? prisma.card.findUnique({ where: { id: draft.id }, select: { origin: true, status: true, variants: { select: linkedSelect, orderBy: { createdAt: "asc" } }, _count: { select: usage } } }) : null,
  ]);
  return { series, base, variants: card?.variants ?? [], deletable: card ? deletableCard(card, card._count) : false };
}

export async function catalogEditorDraft(id: string, duplicate = false): Promise<CardDraft | null> {
  const c = await prisma.card.findUnique({ where: { id } }); if (!c) return null;
  const descriptions = c.description as { fr?: string; en?: string };
  return { ...blankCard(c.seriesId), ...(!duplicate && { id: c.id, updatedAt: c.updatedAt.toISOString() }),
    name: c.name, nameNative: c.nameNative, imageUrl: c.imageUrl, rarity: c.rarity, power: c.power, ki: c.ki,
    description: { fr: descriptions.fr || "", en: descriptions.en || "" }, appearance: parseAppearance(c.appearance),
    dropWeight: c.dropWeight, boosterIds: c.boosterIds, status: duplicate ? "DRAFT" : c.status,
    gender: c.gender, role: c.role as CardDraft["role"], birthMonth: c.birthMonth, birthDay: c.birthDay,
    variantOfId: c.variantOfId, formName: c.formName };
}

/**
 * Nouvelle variante (AR, Gold…) d'une carte de base : identité reprise, mais jamais l'image,
 * l'apparence ni les stats — l'admin choisit le visuel de la nouvelle forme.
 */
export async function catalogVariantDraft(baseId: string, rarity: string): Promise<CardDraft | null> {
  const [base, definitions] = await Promise.all([catalogEditorDraft(baseId, true), getRarityDefinitions()]);
  if (!base || !definitions.some((r) => r.key === rarity && r.variantRequired)) return null;
  const root = await prisma.card.findUnique({ where: { id: baseId }, select: { variantOfId: true } });
  if (root?.variantOfId) return null;
  return { ...base, rarity, imageUrl: "", appearance: {}, variantOfId: baseId, formName: null };
}

export async function rarityEditorDraft(key: string | null) {
  const definitions = await getRarityDefinitions();
  const r = definitions.find((r) => r.key === key) ?? definitions[0];
  const [rates, values, keywords, gifts, trades] = await Promise.all([
    getSetting("booster.rates"), getSetting("collection.recycleValues"), getSetting("battle.keywordsByRarity"), getSetting("gifts.allowedRarities"), getSetting("trades.allowedRarities"),
  ]);
  return { ...r, variantRequired: Boolean(r.variantRequired), key: key ? r.key : "", create: !key, template: r.key,
    ...(key ? {} : { updatedAt: undefined, nameFr: "", nameEn: "", sortOrder: Math.max(...definitions.map((d) => d.sortOrder)) + 100 }),
    rate: key ? rates[r.key] ?? 0 : 0, recycleValue: values[r.key] ?? 0, keywords: keywords[r.key] ?? 0, gifts: gifts.includes(r.key), trades: trades.includes(r.key) };
}

export const CARD_OWNERS_SHOWN = 200;

/** Qui possède une carte et en combien d'exemplaires : les plus gros détenteurs d'abord. */
export async function cardOwners(cardId: string) {
  const [copies, [distinct], grouped] = await Promise.all([
    prisma.userCard.count({ where: { cardId } }),
    prisma.$queryRaw<{ owners: number }[]>`SELECT COUNT(DISTINCT "ownerId")::int AS owners FROM "UserCard" WHERE "cardId" = ${cardId}`,
    prisma.userCard.groupBy({ by: ["ownerId"], where: { cardId }, _count: { _all: true }, orderBy: [{ _count: { id: "desc" } }, { ownerId: "asc" }], take: CARD_OWNERS_SHOWN }),
  ]);
  const users = grouped.length
    ? await prisma.user.findMany({ where: { id: { in: grouped.map((g) => g.ownerId) } }, select: { id: true, username: true, isGuest: true } })
    : [];
  const byId = new Map(users.map((u) => [u.id, u]));
  const list = grouped.flatMap((g) => {
    const user = byId.get(g.ownerId);
    return user ? [{ userId: user.id, username: user.username, isGuest: user.isGuest, copies: g._count._all }] : [];
  });
  return { owners: distinct?.owners ?? 0, copies, list };
}
