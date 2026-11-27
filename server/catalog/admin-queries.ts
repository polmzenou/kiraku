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
import { canDeleteCatalogCard, canEditCatalogCard, type CatalogScope } from "@/lib/admin/roles";

const PAGE_SIZE = 24;
const usage = { copies: true, discoveries: true, wishedBy: true, lotItems: true, auctions: true, notablePulls: true, tradesWanted: true, tradesChosen: true, tradeOffers: true, variants: true, abilityPurchases: true, consecrations: true } as const;
type UsageKey = keyof typeof usage;
type Usage = Record<UsageKey, number>;
const emptyUsage = (): Usage => Object.fromEntries(Object.keys(usage).map((k) => [k, 0])) as Usage;

/**
 * Mêmes comptes que `_count: { select: usage }`, pour les cartes de la page seulement. Dans un findMany, le
 * `_count` de Prisma agrégeait chacune de ces tables en entier (UserCard et Discovery comprises) à chaque vue de
 * la liste, avant de joindre les 24 cartes. Une fiche seule (findUnique) n'a pas ce défaut : Postgres y pousse l'id.
 */
export async function cardUsageCounts(ids: string[]): Promise<Map<string, Usage>> {
  const byCard = new Map(ids.map((id) => [id, emptyUsage()]));
  if (ids.length === 0) return byCard;
  const rows = await prisma.$queryRaw<{ k: UsageKey; id: string; n: number }[]>`
    SELECT 'copies' AS k, "cardId" AS id, COUNT(*)::int AS n FROM "UserCard" WHERE "cardId" = ANY(${ids}) GROUP BY 2
    UNION ALL SELECT 'discoveries', "cardId", COUNT(*)::int FROM "Discovery" WHERE "cardId" = ANY(${ids}) GROUP BY 2
    UNION ALL SELECT 'wishedBy', "cardId", COUNT(*)::int FROM "WishlistEntry" WHERE "cardId" = ANY(${ids}) GROUP BY 2
    UNION ALL SELECT 'lotItems', "cardId", COUNT(*)::int FROM "LotItem" WHERE "cardId" = ANY(${ids}) GROUP BY 2
    UNION ALL SELECT 'auctions', "cardId", COUNT(*)::int FROM "Auction" WHERE "cardId" = ANY(${ids}) GROUP BY 2
    UNION ALL SELECT 'notablePulls', "cardId", COUNT(*)::int FROM "NotablePull" WHERE "cardId" = ANY(${ids}) GROUP BY 2
    UNION ALL SELECT 'tradesWanted', "wantedCardId", COUNT(*)::int FROM "Trade" WHERE "wantedCardId" = ANY(${ids}) GROUP BY 2
    UNION ALL SELECT 'tradesChosen', "chosenCardId", COUNT(*)::int FROM "Trade" WHERE "chosenCardId" = ANY(${ids}) GROUP BY 2
    UNION ALL SELECT 'tradeOffers', "cardId", COUNT(*)::int FROM "TradeOffer" WHERE "cardId" = ANY(${ids}) GROUP BY 2
    UNION ALL SELECT 'variants', "variantOfId", COUNT(*)::int FROM "Card" WHERE "variantOfId" = ANY(${ids}) GROUP BY 2
    UNION ALL SELECT 'abilityPurchases', "cardId", COUNT(*)::int FROM "AbilityPurchase" WHERE "cardId" = ANY(${ids}) GROUP BY 2
    UNION ALL SELECT 'consecrations', "cardId", COUNT(*)::int FROM "ConsecratedCard" WHERE "cardId" = ANY(${ids}) GROUP BY 2`;
  for (const r of rows) {
    const counts = byCard.get(r.id);
    if (counts && r.k in counts) counts[r.k] = r.n;
  }
  return byCard;
}

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
      status: true, origin: true, updatedAt: true, variantOfId: true, spoiler: true, series: { select: { titleRomaji: true } } } });
  // Usages et détenteurs distincts des cartes de la page
  const ids = rows.map((r) => r.id);
  const [usages, owned] = await Promise.all([
    cardUsageCounts(ids),
    ids.length ? prisma.$queryRaw<{ cardId: string; owners: number }[]>`
      SELECT "cardId", COUNT(DISTINCT "ownerId")::int AS owners FROM "UserCard" WHERE "cardId" IN (${Prisma.join(ids)}) GROUP BY "cardId"` : [],
  ]);
  const owners = new Map(owned.map((o) => [o.cardId, o.owners]));
  const cards = rows.map((c) => {
    const counts = usages.get(c.id) ?? emptyUsage();
    return { ...c, updatedAt: c.updatedAt.toISOString(), variants: counts.variants, copies: counts.copies, owners: owners.get(c.id) ?? 0, deletable: deletableCard(c, counts) };
  });
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
    prisma.boosterType.findMany({ orderBy: [{ family: "asc" }, { sortOrder: "asc" }], select: { id: true, slug: true, name: true, active: true, includeCustom: true } }),
    statMedians(),
  ]);
  return { rarities, boosters, medians, storageConfigured: Boolean(process.env.BLOB_READ_WRITE_TOKEN && process.env.BLOB_PUBLIC_HOST) };
}
export type CatalogEditorOptions = Awaited<ReturnType<typeof catalogEditorOptions>>;

const linkedSelect = { id: true, publicId: true, name: true, formName: true, imageUrl: true, rarity: true, status: true, nameNative: true, rank: true, power: true, ki: true, appearance: true } as const;
export type LinkedCard = Prisma.CardGetPayload<{ select: typeof linkedSelect }>;

/**
 * Contexte d'une fiche : série choisie, carte de base, variantes, possibilité de modification
 * (DEV : brouillon jamais distribué) et de suppression. Les actions revérifient tout sous verrou.
 */
export async function catalogEditorContext(draft: CardDraft, scope: CatalogScope = "full") {
  const [series, base, card] = await Promise.all([
    draft.seriesId ? prisma.series.findUnique({ where: { id: draft.seriesId }, select: { id: true, titleRomaji: true } }) : null,
    draft.variantOfId ? prisma.card.findUnique({ where: { id: draft.variantOfId }, select: linkedSelect }) : null,
    draft.id ? prisma.card.findUnique({ where: { id: draft.id }, select: { origin: true, status: true, variants: { select: linkedSelect, orderBy: { createdAt: "asc" } }, _count: { select: usage } } }) : null,
  ]);
  const editable = canEditCatalogCard(scope, card && { status: card.status, copies: card._count.copies + card._count.discoveries }, "DRAFT");
  return { series, base, variants: card?.variants ?? [], editable,
    deletable: card ? deletableCard(card, card._count) && canDeleteCatalogCard(scope, card.status) : false };
}

export async function catalogEditorDraft(id: string, duplicate = false): Promise<CardDraft | null> {
  const c = await prisma.card.findUnique({ where: { id } }); if (!c) return null;
  const descriptions = c.description as { fr?: string; en?: string };
  return { ...blankCard(c.seriesId), ...(!duplicate && { id: c.id, updatedAt: c.updatedAt.toISOString() }),
    name: c.name, nameNative: c.nameNative, imageUrl: c.imageUrl, rarity: c.rarity, power: c.power, ki: c.ki,
    description: { fr: descriptions.fr || "", en: descriptions.en || "" }, appearance: parseAppearance(c.appearance),
    dropWeight: c.dropWeight, boosterIds: c.boosterIds, boosterExclusive: c.boosterExclusive, status: duplicate ? "DRAFT" : c.status,
    gender: c.gender, role: c.role as CardDraft["role"], birthMonth: c.birthMonth, birthDay: c.birthDay,
    variantOfId: c.variantOfId, formName: c.formName, spoiler: c.spoiler };
}

/**
 * Nouvelle variante (AR, Gold…) d'une carte de base : identité reprise, mais jamais l'image,
 * l'apparence ni les stats — l'admin choisit le visuel de la nouvelle forme. La case spoil suit
 * la carte de base : la forme d'un personnage spoil l'est presque toujours.
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
  const [rates, values, keywords, gifts, trades, ultimates] = await Promise.all([
    getSetting("booster.rates"), getSetting("collection.recycleValues"), getSetting("battle.keywordsByRarity"), getSetting("gifts.allowedRarities"), getSetting("trades.allowedRarities"),
    getSetting("battle.ultimateRarities"),
  ]);
  return { ...r, variantRequired: Boolean(r.variantRequired), key: key ? r.key : "", create: !key, template: r.key,
    ...(key ? {} : { updatedAt: undefined, nameFr: "", nameEn: "", sortOrder: Math.max(...definitions.map((d) => d.sortOrder)) + 100 }),
    rate: key ? rates[r.key] ?? 0 : 0, recycleValue: values[r.key] ?? 0, keywords: keywords[r.key] ?? 0, gifts: gifts.includes(r.key), trades: trades.includes(r.key),
    ultimate: ultimates.includes(r.key) };
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
