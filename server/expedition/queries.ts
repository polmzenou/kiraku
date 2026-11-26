import "server-only";
import type { CardView } from "@/lib/boosters/view";
import { localize, parseLocalized } from "@/lib/boosters/types";
import { balanceFor } from "@/lib/expedition/balance";
import { loreOf, parseSnapshot } from "@/lib/expedition/snapshot";
import { suggestTeam, type PoolCard } from "@/lib/expedition/team";
import { headroom, tierOf } from "@/lib/expedition/tiers";
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
import { prisma } from "../db";
import { pushLater } from "../market/queries";
import { cooldownUntil, discoveryPctWith, ensureBoardWith, settleDueForWith, sweepDueWith } from "./expedition-core";
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

type LotRow = { id: string; zeni: number; items: { kind: string; quantity: number; rarity: string | null }[] };

function extraLotView(lot: LotRow | undefined): ExtraLotView | null {
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
  const typeIds = canLaunch ? await ensureBoardWith(prisma, user.id, ctx) : [];

  const [types, activeRow, resultRow, cooldown, playedToday, discoveryPct, pool, historyRows] = await Promise.all([
    typeIds.length ? prisma.expeditionType.findMany({ where: { id: { in: typeIds } } }) : [],
    prisma.expedition.findFirst({ where: { userId: user.id, status: "ACTIVE" } }),
    prisma.expedition.findFirst({ where: { userId: user.id, status: "COMPLETED", revealedAt: null }, orderBy: { settledAt: "desc" } }),
    cooldownUntil(prisma, user.id, now),
    prisma.expedition.findMany({
      where: { userId: user.id, dayKey: ctx.dayKey, status: { not: "ABANDONED" } },
      select: { slot: true },
    }),
    discoveryPctWith(prisma, user.id),
    canLaunch ? suggestionPool(user.id) : [],
    prisma.expedition.findMany({
      where: { userId: user.id, status: { not: "ACTIVE" } },
      orderBy: { startedAt: "desc" },
      take: HISTORY_SIZE,
      select: { id: true, status: true, outcome: true, startedAt: true, snapshot: true },
    }),
  ]);

  const activeSnap = activeRow ? parseSnapshot(activeRow.snapshot) : null;
  const resultSnap = resultRow ? parseSnapshot(resultRow.snapshot) : null;
  const typeById = new Map(types.map((t) => [t.id, t]));

  // Noms des boosters et contenus des lots bonus, en une requête chacun
  const boosterIds = new Set<string>(types.map((t) => t.boosterTypeId));
  const lotIds = new Set<string>(types.flatMap((t) => (t.extraLotId ? [t.extraLotId] : [])));
  for (const snap of [activeSnap, resultSnap]) {
    if (!snap) continue;
    boosterIds.add(snap.boosterTypeId);
    if (snap.extraLotId) lotIds.add(snap.extraLotId);
  }
  const poolCards: PoolCard[] = pool.flatMap((c) => {
    const tier = tierOf(c.rarity, definitions);
    return tier === null ? [] : [{ cardId: c.cardId, tier, rank: c.rank }];
  });
  const freeTiers = new Set(poolCards.map((c) => c.tier));
  const bestTier = poolCards.reduce((max, c) => Math.max(max, c.tier), -1);

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

  const offers: OfferView[] = offersBase.map(({ slot, type, minTier, suggestions }) => {
    const balance = balanceFor(type, rules, rules.cardBonus, headroom(type.minRarity, definitions));
    // Fourchette réaliste : équipe la plus juste, et la meilleure que le joueur peut aligner aujourd'hui
    const reach = Math.max(0, Math.min(3, bestTier - minTier));
    const mine = bestTier >= minTier ? balanceFor(type, rules, rules.cardBonus, reach).ideal.success : balance.minimal.success;
    const state = !type.active ? "UNAVAILABLE" : played.has(slot) ? "DONE" : discoveryPct < type.minDiscoveryPct ? "LOCKED" : "OPEN";
    return {
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
      state,
      staffable: [...freeTiers].some((t) => t >= minTier),
      suggestions,
      range: { min: balance.minimal.success, max: Math.max(mine, balance.minimal.success) },
    };
  });

  const active: ActiveExpeditionView | null =
    activeRow && activeSnap
      ? {
          id: activeRow.id,
          slot: activeRow.slot,
          name: localize(activeSnap.name, locale),
          lore: localizedLore(activeSnap.lore, locale),
          minRarity: activeSnap.minRarity,
          risk: activeSnap.risk,
          startedAt: activeRow.startedAt.toISOString(),
          endsAt: activeRow.endsAt.toISOString(),
          successPct: activeRow.successPct / 100,
          triumphPct: activeRow.triumphPct / 100,
          rewards: activeSnap.rewards,
          boosterName: boosterById.get(activeSnap.boosterTypeId)?.name ?? "",
          extraLot: extraLotView(activeSnap.extraLotId ? lotById.get(activeSnap.extraLotId) : undefined),
          team: teamOf(activeRow.cardIds, activeSnap.bonuses, views),
        }
      : null;

  const result: ExpeditionResultView | null =
    resultRow && resultSnap && resultRow.outcome
      ? {
          id: resultRow.id,
          name: localize(resultSnap.name, locale),
          minRarity: resultSnap.minRarity,
          risk: resultSnap.risk,
          outcome: resultRow.outcome as ExpeditionOutcome,
          reward: resultSnap.rewards[resultRow.outcome as ExpeditionOutcome],
          boosterName: boosterById.get(resultSnap.boosterTypeId)?.name ?? "",
          boosterSlug: boosterById.get(resultSnap.boosterTypeId)?.slug ?? null,
          team: teamOf(resultRow.cardIds, resultSnap.bonuses, views),
          bonusCards: resultRow.rewardCardIds.flatMap((id) => views.get(id) ?? []),
        }
      : null;

  const history: HistoryEntryView[] = historyRows.flatMap((row) => {
    const snap = parseSnapshot(row.snapshot);
    if (!snap) return [];
    const outcome = row.status === "ABANDONED" ? ("ABANDONED" as const) : ((row.outcome ?? "FAILURE") as ExpeditionOutcome);
    const reward = outcome === "ABANDONED" ? null : snap.rewards[outcome];
    return [
      {
        id: row.id,
        name: localize(snap.name, locale),
        minRarity: snap.minRarity,
        outcome,
        startedAt: row.startedAt.toISOString(),
        zeni: reward?.zeni ?? 0,
        boosters: reward?.boosters ?? 0,
      },
    ];
  });

  const suggestionIds = new Set(offersBase.flatMap((o) => [...(o.suggestions.best ?? []), ...(o.suggestions.thrifty ?? [])]));
  return {
    enabled: rules.enabled,
    preview: ctx.preview,
    canLaunch,
    dayKey: ctx.dayKey,
    nextResetAt: ctx.nextResetAt.toISOString(),
    serverNow: now.toISOString(),
    rules: {
      cardBonus: rules.cardBonus,
      abandonCooldownHours: rules.abandonCooldownHours,
      triumphRewardPct: rules.triumphRewardPct,
      failRewardPct: rules.failRewardPct,
    },
    discoveryPct: Math.floor(discoveryPct * 10) / 10,
    offers,
    active,
    result,
    cooldownUntil: cooldown?.toISOString() ?? null,
    history,
    suggestionCards: Object.fromEntries([...suggestionIds].flatMap((id) => (views.has(id) ? [[id, views.get(id)!]] : []))),
  };
}

function localizedLore(raw: unknown, locale: string): string {
  const lore = loreOf(raw);
  return (locale === "en" && lore.en) || lore.fr;
}
