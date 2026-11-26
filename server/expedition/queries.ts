import "server-only";
import type { CardView } from "@/lib/boosters/view";
import { localize, parseLocalized } from "@/lib/boosters/types";
import { historyGains, offerState, successRange, topTeam } from "@/lib/expedition/page";
import { loreOf, parseLotGrant, readSnapshot } from "@/lib/expedition/snapshot";
import { suggestTeam, type PoolCard } from "@/lib/expedition/team";
import { tierOf } from "@/lib/expedition/tiers";
import { rewardsByOutcome } from "@/lib/expedition/rewards";
import type { ExpeditionOutcome, ExpeditionRisk } from "@/lib/expedition/types";
import type {
  ActiveExpeditionView,
  ExpeditionPageView,
  ExpeditionResultView,
  ExtraLotView,
  HistoryEntryView,
  OfferView,
  TeamMemberView,
} from "@/lib/expedition/view";
import { cardViews } from "../boosters/display";
import { getCatalogStats } from "../catalog/queries";
import { prisma } from "../db";
import { pushLater } from "../market/queries";
import {
  discoveryPctWith,
  ensureBoardWith,
  freeCardsByRarityWith,
  overdueCountWith,
  restWindow,
  settleDueForWith,
  sweepDueWith,
} from "./expedition-core";
import { expeditionCtx, settleDeps } from "./rules";

// Lectures de /expedition et clôtures paresseuses (affichage, sondage de la cloche, cron).

const HISTORY_SIZE = 10;

/** Expéditions rentrées du joueur closes maintenant (gains, cartes rendues, notification). */
export async function settleExpeditionsFor(userId: string, now = new Date()) {
  return settleDueForWith(prisma, userId, now, settleDeps(), pushLater);
}

/** Cron : toutes les expéditions rentrées, par lots. */
export async function sweepExpeditions(now: Date, limit: number) {
  return sweepDueWith(prisma, now, limit, settleDeps(), pushLater);
}

/** Cron : expéditions rentrées depuis plus de `graceMs` et toujours pas closes (clôture en échec à chaque essai). */
export async function overdueExpeditions(now: Date, graceMs: number) {
  return overdueCountWith(prisma, new Date(now.getTime() - graceMs));
}

/** Contenu d'un lot (en base, ou recopié dans la photo d'une expédition), résumé pour l'affichage. */
type LotContentRow = { zeni: number; items: readonly { kind: string; quantity: number; rarity?: string | null }[] };

function extraLotView(lot: LotContentRow | null | undefined): ExtraLotView | null {
  if (!lot) return null;
  return {
    zeni: lot.zeni,
    boosters: lot.items.filter((i) => i.kind === "BOOSTER").reduce((n, i) => n + i.quantity, 0),
    cards: lot.items.flatMap((i) => (i.kind === "RARITY_CARD" && i.rarity ? [{ rarity: i.rarity, quantity: i.quantity }] : [])),
    namedCards: lot.items.filter((i) => i.kind === "CARD").reduce((n, i) => n + i.quantity, 0),
  };
}

/** Cartes libres du joueur, quelques-unes par palier (les plus et les moins populaires) : de quoi proposer des équipes. */
async function suggestionPool(userId: string) {
  return prisma.$queryRaw<{ cardId: string; rarity: string; rank: number | null }[]>`
    SELECT t."cardId", t.rarity, t.rank FROM (
      SELECT c.id AS "cardId", c."rarityKey" AS rarity, c.rank,
             ROW_NUMBER() OVER (PARTITION BY rd."sortOrder" ORDER BY c.rank ASC NULLS LAST, c.id) AS top,
             ROW_NUMBER() OVER (PARTITION BY rd."sortOrder" ORDER BY c.rank DESC NULLS FIRST, c.id) AS low
      FROM (SELECT DISTINCT uc."cardId" FROM "UserCard" uc WHERE uc."ownerId" = ${userId} AND uc.status = 'COLLECTION') f
      JOIN "Card" c ON c.id = f."cardId"
      JOIN "RarityDefinition" rd ON rd.key = c."rarityKey"
    ) t
    WHERE t.top <= 3 OR t.low <= 3`;
}

function teamOf(cardIds: readonly string[], bonuses: readonly number[], views: Map<string, CardView>): TeamMemberView[] {
  return cardIds.flatMap((id, i) => {
    const card = views.get(id);
    return card ? [{ ...card, bonus: bonuses[i] ?? 0 }] : [];
  });
}

/** Toute la page /expedition pour un joueur (après clôture de ce qui est rentré). */
export async function getExpeditionPage(user: { id: string; role: string }, locale: string): Promise<ExpeditionPageView> {
  const admin = user.role === "ADMIN";
  const ctx = await expeditionCtx(admin);
  const { now, rules, definitions } = ctx;
  // Une clôture en erreur (lot introuvable, photo illisible) est journalisée : la page s'affiche quand même, et le
  // cron ou le sondage retenteront, comme pour le sondage
  try {
    await settleExpeditionsFor(user.id, now);
  } catch (e) {
    console.error("[expedition] clôture à l'affichage impossible", e);
  }

  const canLaunch = rules.enabled || ctx.preview;
  // Expédition en route et repos lus avec le plateau (requêtes légères) : la feuille d'équipe ne peut s'ouvrir que
  // sans eux, les équipes proposées (et leurs cartes) ne sont calculées qu'alors
  const [typeIds, activeRow, rest] = await Promise.all([
    canLaunch ? ensureBoardWith(prisma, user.id, ctx) : ([] as string[]),
    prisma.expedition.findFirst({ where: { userId: user.id, status: "ACTIVE" } }),
    restWindow(prisma, user.id, now),
  ]);
  const canStaff = typeIds.length > 0 && !activeRow && !rest;

  const [types, resultRow, playedToday, discoveryPct, pool, freeByRarity, historyRows] = await Promise.all([
    typeIds.length ? prisma.expeditionType.findMany({ where: { id: { in: typeIds } } }) : [],
    prisma.expedition.findFirst({ where: { userId: user.id, status: "COMPLETED", revealedAt: null }, orderBy: { settledAt: "desc" } }),
    prisma.expedition.findMany({
      where: { userId: user.id, dayKey: ctx.dayKey, status: { not: "ABANDONED" } },
      select: { slot: true },
    }),
    // Total des cartes publiées : celui du cache du catalogue (invalidé à chaque écriture), pas un nouveau comptage
    getCatalogStats().then((stats) => discoveryPctWith(prisma, user.id, stats.total)),
    canStaff ? suggestionPool(user.id) : [],
    // Départ impossible : de quoi dire seulement si l'offre est jouable et sa meilleure chance, sans charger de cartes
    typeIds.length > 0 && !canStaff ? freeCardsByRarityWith(prisma, user.id) : null,
    prisma.expedition.findMany({
      where: { userId: user.id, status: { not: "ACTIVE" } },
      orderBy: { startedAt: "desc" },
      // Une de plus : le rapport pas encore ouvert est retiré du journal
      take: HISTORY_SIZE + 1,
      select: { id: true, status: true, outcome: true, startedAt: true, snapshot: true, rewardCardIds: true, lotGrant: true },
    }),
  ]);

  const activeSnap = activeRow ? readSnapshot(activeRow.snapshot) : null;
  const resultSnap = resultRow ? readSnapshot(resultRow.snapshot) : null;
  const resultLot = resultRow ? parseLotGrant(resultRow.lotGrant) : null;
  const typeById = new Map(types.map((t) => [t.id, t]));

  // Noms des boosters et contenus des lots bonus, en une requête chacun
  const boosterIds = new Set<string>(types.map((t) => t.boosterTypeId));
  const lotIds = new Set<string>(types.flatMap((t) => (t.extraLotId ? [t.extraLotId] : [])));
  for (const snap of [activeSnap, resultSnap]) if (snap?.boosterTypeId) boosterIds.add(snap.boosterTypeId);
  // Photo d'avant la copie du lot : le lot tel qu'il est aujourd'hui
  if (activeSnap && activeSnap.lot === undefined && activeSnap.extraLotId) lotIds.add(activeSnap.extraLotId);

  const poolCards: PoolCard[] = pool.flatMap((c) => {
    const tier = tierOf(c.rarity, definitions);
    return tier === null ? [] : [{ cardId: c.cardId, tier, rank: c.rank }];
  });
  // Cartes libres distinctes par rareté : relevées à part, ou tirées du pool des suggestions (au moins 3 par palier)
  const free = freeByRarity ?? countByRarity(pool);
  const freeTiers = new Set(free.flatMap((f) => (f.cards > 0 ? [tierOf(f.rarity, definitions) ?? -1] : [])));
  const bestTeam = topTeam(free, definitions);

  const offersBase = typeIds.flatMap((typeId, slot) => {
    const type = typeById.get(typeId);
    if (!type) return [];
    const minTier = tierOf(type.minRarity, definitions) ?? 0;
    const suggestions = { best: suggestTeam(poolCards, minTier, "best"), thrifty: suggestTeam(poolCards, minTier, "thrifty") };
    return [{ slot, type, minTier, suggestions }];
  });
  const viewIds = [
    ...(activeRow?.cardIds ?? []),
    ...(resultRow?.cardIds ?? []),
    ...(resultRow?.rewardCardIds ?? []),
    ...offersBase.flatMap((o) => [...(o.suggestions.best ?? []), ...(o.suggestions.thrifty ?? [])]),
  ];
  const [boosters, lots, views] = await Promise.all([
    boosterIds.size ? prisma.boosterType.findMany({ where: { id: { in: [...boosterIds] } }, select: { id: true, slug: true, name: true } }) : [],
    lotIds.size
      ? prisma.lot.findMany({ where: { id: { in: [...lotIds] } }, select: { id: true, zeni: true, items: { select: { kind: true, quantity: true, rarity: true } } } })
      : [],
    viewIds.length ? cardViews(viewIds, locale) : new Map<string, CardView>(),
  ]);
  const boosterById = new Map(boosters.map((b) => [b.id, { slug: b.slug, name: localize(parseLocalized(b.name, b.slug), locale) }]));
  const lotById = new Map(lots.map((l) => [l.id, l]));
  const played = new Set(playedToday.map((p) => p.slot));

  const offers: OfferView[] = offersBase.map(({ slot, type, minTier, suggestions }) => ({
    slot,
    typeId: type.id,
    name: localize(parseLocalized(type.name, type.slug), locale),
    lore: localizedLore(type.lore, locale),
    minRarity: type.minRarity,
    risk: type.risk as ExpeditionRisk,
    durationMinutes: type.durationMinutes,
    baseSuccessPct: type.baseSuccessPct,
    maxSuccessPct: type.maxSuccessPct,
    maxTriumphPct: type.maxTriumphPct,
    minDiscoveryPct: type.minDiscoveryPct,
    rewards: rewardsByOutcome(type, rules),
    boosterName: boosterById.get(type.boosterTypeId)?.name ?? "",
    extraLot: extraLotView(type.extraLotId ? lotById.get(type.extraLotId) : undefined),
    state: offerState(type, played.has(slot), discoveryPct),
    staffable: [...freeTiers].some((t) => t >= minTier),
    suggestions,
    // Équipe la plus juste, et la meilleure que le joueur peut aligner aujourd'hui
    range: successRange(type, rules, definitions, bestTeam),
  }));

  const active: ActiveExpeditionView | null =
    activeRow && activeSnap
      ? {
          id: activeRow.id,
          name: localize(activeSnap.name, locale),
          minRarity: activeSnap.minRarity,
          risk: activeSnap.risk,
          startedAt: activeRow.startedAt.toISOString(),
          endsAt: activeRow.endsAt.toISOString(),
          successPct: activeRow.successPct / 100,
          triumphPct: activeRow.triumphPct / 100,
          rewards: activeSnap.rewards,
          boosterName: boosterById.get(activeSnap.boosterTypeId)?.name ?? "",
          // Le lot recopié au départ, celui qui sera versé
          extraLot: extraLotView(activeSnap.lot !== undefined ? activeSnap.lot : activeSnap.extraLotId ? lotById.get(activeSnap.extraLotId) : null),
          team: teamOf(activeRow.cardIds, activeSnap.bonuses, views),
        }
      : null;

  // Photo en partie illisible : rapport minimal (repli de chaque champ) plutôt qu'une lettre qui ne s'ouvre jamais
  const result: ExpeditionResultView | null =
    resultRow && resultSnap && resultRow.outcome
      ? {
          id: resultRow.id,
          name: localize(resultSnap.name, locale),
          minRarity: resultSnap.minRarity,
          outcome: resultRow.outcome as ExpeditionOutcome,
          reward: resultSnap.rewards[resultRow.outcome as ExpeditionOutcome],
          boosterName: boosterById.get(resultSnap.boosterTypeId)?.name ?? "",
          boosterSlug: boosterById.get(resultSnap.boosterTypeId)?.slug ?? null,
          lotZeni: resultLot?.zeni ?? 0,
          lotBoosters: resultLot?.boosters.reduce((n, b) => n + b.count, 0) ?? 0,
          team: teamOf(resultRow.cardIds, resultSnap.bonuses, views),
          bonusCards: resultRow.rewardCardIds.flatMap((id) => views.get(id) ?? []),
        }
      : null;

  // Le rapport qui attend en haut de la page n'entre au journal qu'une fois ouvert : il n'en dévoile pas l'issue
  const history: HistoryEntryView[] = historyRows
    .filter((row) => row.id !== resultRow?.id)
    .slice(0, HISTORY_SIZE)
    .map((row) => {
      const snap = readSnapshot(row.snapshot);
      const outcome = row.status === "ABANDONED" ? ("ABANDONED" as const) : ((row.outcome ?? "FAILURE") as ExpeditionOutcome);
      const gains = historyGains(outcome === "ABANDONED" ? null : snap.rewards[outcome], parseLotGrant(row.lotGrant), row.rewardCardIds.length);
      return { id: row.id, name: localize(snap.name, locale), minRarity: snap.minRarity, outcome, startedAt: row.startedAt.toISOString(), ...gains };
    });

  const suggestionIds = new Set(offersBase.flatMap((o) => [...(o.suggestions.best ?? []), ...(o.suggestions.thrifty ?? [])]));
  return {
    enabled: rules.enabled,
    preview: ctx.preview,
    canLaunch,
    dayKey: ctx.dayKey,
    nextResetAt: ctx.nextResetAt.toISOString(),
    serverNow: now.toISOString(),
    rules: { cardBonus: rules.cardBonus, abandonCooldownHours: rules.abandonCooldownHours },
    discoveryPct: Math.floor(discoveryPct * 10) / 10,
    offers,
    active,
    result,
    cooldownFrom: rest?.from?.toISOString() ?? null,
    cooldownUntil: rest?.until.toISOString() ?? null,
    history,
    suggestionCards: Object.fromEntries([...suggestionIds].flatMap((id) => (views.has(id) ? [[id, views.get(id)!]] : []))),
  };
}

/** Cartes distinctes par rareté d'un pool de suggestions (une ligne par carte). */
function countByRarity(pool: readonly { rarity: string }[]): { rarity: string; cards: number }[] {
  const counts = new Map<string, number>();
  for (const c of pool) counts.set(c.rarity, (counts.get(c.rarity) ?? 0) + 1);
  return [...counts].map(([rarity, cards]) => ({ rarity, cards }));
}

function localizedLore(raw: unknown, locale: string): string {
  const lore = loreOf(raw);
  return (locale === "en" && lore.en) || lore.fr;
}
