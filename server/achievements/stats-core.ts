// Statistiques des succès, relues dans l'historique du joueur (aucun compteur à tenir à jour dans les chemins
// chauds). Seules les métriques demandées sont calculées : celles des succès encore verrouillés. Client injecté
// (base de test pour *.db.test.ts) ; les statistiques du profil (cartes uniques au meilleur cycle, rang de
// carrière, prestige…) viennent de getProfileStats, passée par l'appelant.
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { metricOf, type AchievementStats } from "@/lib/achievements/evaluate";
import { longestDayRun, longestRun } from "@/lib/achievements/streaks";
import { BOARD_TIERS } from "@/lib/battle/tiers";
import { SPEND_REASONS } from "@/lib/economy/missions";
import type { ProfileStats } from "@/lib/profile/conditions";
import { isLayoutId, layoutCapacity } from "@/lib/showcase/layouts";
import { installedReferralWhere } from "../referral/installed";

type Db = PrismaClient | Prisma.TransactionClient;

export type StatsContext = {
  /** Fuseau du jeu (game.timeZone) : jours de la récompense quotidienne, anniversaires, heure d'ouverture. */
  timeZone: string;
  now: Date;
  /** Statistiques du profil (server/profile/progress.ts), chargées seulement si une métrique en a besoin. */
  loadProfile: () => Promise<ProfileStats>;
};

const DAY_MS = 86_400_000;

/** Métriques lues dans getProfileStats. */
const PROFILE_METRICS = ["UNIQUE_CARDS", "CATALOG_PERCENT", "SERIES_COMPLETED", "TRADES", "RANK_TIER", "PRESTIGE", "CONSECRATED", "PRINTINGS"];

const num = (v: unknown): number => {
  const n = typeof v === "bigint" ? Number(v) : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Paramètres demandés pour une métrique (« TOP_RANKED:1 », « TOP_RANKED:10 » → ["1", "10"]). */
function paramsOf(needed: ReadonlySet<string>, metric: string): string[] {
  const prefix = `${metric}:`;
  return [...needed].filter((s) => s.startsWith(prefix)).map((s) => s.slice(prefix.length));
}

export async function getAchievementStatsWith(db: Db, userId: string, needed: ReadonlySet<string>, ctx: StatsContext): Promise<AchievementStats> {
  const metrics = new Set([...needed].map(metricOf));
  const want = (...keys: string[]) => keys.some((k) => metrics.has(k));
  const values = new Map<string, number>();
  const goals = new Map<string, number>();
  const set = (key: string, value: unknown): void => {
    values.set(key, num(value));
  };
  const tz = ctx.timeZone;
  const tasks: Promise<void>[] = [];

  const userTask = want("INCENSE", "DISCORD_LINKED", "FULL_STYLE", "ACCOUNT_DAYS", "MAX_BALANCE", "EXACT_BALANCE", "SEASON_GAMES")
    ? db.user.findUnique({
        where: { id: userId },
        select: { incenseUsed: true, discordLinkedAt: true, titleId: true, frameId: true, nameColorId: true, createdAt: true, coins: true, seasonGames: true },
      })
    : Promise.resolve(null);

  // Profil : cartes uniques (meilleur cycle), % découvert, séries complétées, échanges, rang de carrière, prestige
  if (want(...PROFILE_METRICS)) {
    tasks.push(
      ctx.loadProfile().then((p) => {
        set("UNIQUE_CARDS", p.uniqueCards);
        set("CATALOG_PERCENT", p.discoveredPercent);
        set("SERIES_COMPLETED", p.completedSeries.size);
        set("TRADES", p.tradesDone);
        set("RANK_TIER", p.tier ? BOARD_TIERS.indexOf(p.tier) + 1 : 0);
        set("PRESTIGE", p.prestige ?? 0);
        set("CONSECRATED", p.consecrated ?? 0);
        set("PRINTINGS", p.printingsOwned ?? 0);
      }),
    );
  }

  // 開 Boosters
  if (want("OPENINGS", "GOLDEN", "DIVINE", "APOC_SPARED", "APOC_RUINED", "PITY", "FEATURED", "BOOSTER_TYPES")) {
    tasks.push(
      db.$queryRaw<Record<string, number>[]>`
        SELECT count(*)::int AS openings,
          count(*) FILTER (WHERE golden)::int AS golden,
          count(*) FILTER (WHERE divine)::int AS divine,
          count(*) FILTER (WHERE apocalypse = 'SPARED')::int AS spared,
          count(*) FILTER (WHERE apocalypse = 'RUINED')::int AS ruined,
          count(*) FILTER (WHERE "pityTriggered")::int AS pity,
          count(*) FILTER (WHERE "featuredHit")::int AS featured,
          count(DISTINCT "boosterSlug")::int AS types
        FROM "BoosterOpening" WHERE "userId" = ${userId}`.then(([r]) => {
        set("OPENINGS", r?.openings);
        set("GOLDEN", r?.golden);
        set("DIVINE", r?.divine);
        set("APOC_SPARED", r?.spared);
        set("APOC_RUINED", r?.ruined);
        set("PITY", r?.pity);
        set("FEATURED", r?.featured);
        set("BOOSTER_TYPES", r?.types);
      }),
    );
  }
  if (want("SHAPE")) {
    tasks.push(
      db.$queryRaw<{ shape: string; n: number }[]>`
        SELECT t.shape::text AS shape, count(*)::int AS n
        FROM "BoosterOpening" o JOIN "BoosterType" t ON t.slug = o."boosterSlug"
        WHERE o."userId" = ${userId}
        GROUP BY t.shape`.then((rows) => {
        for (const r of rows) set(`SHAPE:${r.shape}`, r.n);
      }),
    );
  }
  if (want("APOC_RUINED_STREAK")) {
    tasks.push(
      db.boosterOpening
        .findMany({ where: { userId, apocalypse: { not: null } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { apocalypse: true } })
        .then((rows) => set("APOC_RUINED_STREAK", longestRun(rows.map((r) => r.apocalypse === "RUINED")))),
    );
  }
  if (want("BIRTHDAY_PULL")) {
    tasks.push(
      db.$queryRaw<{ ok: boolean }[]>`
        SELECT EXISTS (
          SELECT 1
          FROM "BoosterOpening" o
          CROSS JOIN LATERAL unnest(o."catalogCardIds") AS pulled(card_id)
          JOIN "Card" c ON c.id = pulled.card_id
          WHERE o."userId" = ${userId} AND c."birthMonth" IS NOT NULL AND c."birthDay" IS NOT NULL
            AND c."birthMonth" = extract(month FROM (o."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${tz}))
            AND c."birthDay" = extract(day FROM (o."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${tz}))
        ) AS ok`.then(([r]) => set("BIRTHDAY_PULL", r?.ok ? 1 : 0)),
    );
  }
  for (const hour of paramsOf(needed, "NIGHT_OPENING")) {
    const h = Number(hour);
    if (!Number.isInteger(h) || h < 0 || h > 23) continue;
    tasks.push(
      db.$queryRaw<{ ok: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM "BoosterOpening"
          WHERE "userId" = ${userId} AND extract(hour FROM ("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${tz})) = ${h}
        ) AS ok`.then(([r]) => set(`NIGHT_OPENING:${hour}`, r?.ok ? 1 : 0)),
    );
  }
  if (want("DOUBLE_MYTHIC")) {
    // Deux cartes Mythiques ou mieux (registre des raretés) dans un même booster
    tasks.push(
      db.$queryRaw<{ ok: boolean }[]>`
        SELECT EXISTS (
          SELECT 1
          FROM "BoosterOpening" o
          CROSS JOIN LATERAL unnest(o."catalogCardIds") AS pulled(card_id)
          JOIN "Card" c ON c.id = pulled.card_id
          JOIN "RarityDefinition" r ON r.key = c."rarityKey"
          WHERE o."userId" = ${userId}
            AND r."sortOrder" >= (SELECT "sortOrder" FROM "RarityDefinition" WHERE key = 'MYTHIC')
          GROUP BY o.id
          HAVING count(*) >= 2
        ) AS ok`.then(([r]) => set("DOUBLE_MYTHIC", r?.ok ? 1 : 0)),
    );
  }

  // 集 Collection
  if (want("RARITY", "ALL_VARIANTS")) {
    tasks.push(
      Promise.all([
        db.$queryRaw<{ rarity: string; n: number }[]>`
          SELECT c."rarityKey" AS rarity, count(*)::int AS n
          FROM "Discovery" d JOIN "Card" c ON c.id = d."cardId"
          WHERE d."userId" = ${userId}
          GROUP BY c."rarityKey"`,
        db.rarityDefinition.findMany({ where: { variantRequired: true }, select: { key: true } }),
      ]).then(([rows, variants]) => {
        const found = new Map(rows.map((r) => [r.rarity, r.n]));
        for (const [rarity, n] of found) set(`RARITY:${rarity}`, n);
        set("ALL_VARIANTS", variants.filter((v) => (found.get(v.key) ?? 0) > 0).length);
        if (variants.length > 0) goals.set("ALL_VARIANTS", variants.length);
      }),
    );
  }
  if (want("VARIANT_FAMILY")) {
    // Le plus de variantes d'un même personnage obtenues, sa version de base comprise
    tasks.push(
      db.$queryRaw<{ n: number }[]>`
        SELECT coalesce(max(n), 0)::int AS n FROM (
          SELECT count(DISTINCT v.id) AS n
          FROM "Discovery" d JOIN "Card" v ON v.id = d."cardId"
          WHERE d."userId" = ${userId} AND v."variantOfId" IS NOT NULL
            AND EXISTS (SELECT 1 FROM "Discovery" b WHERE b."userId" = ${userId} AND b."cardId" = v."variantOfId")
          GROUP BY v."variantOfId"
        ) f`.then(([r]) => set("VARIANT_FAMILY", r?.n)),
    );
  }
  if (want("SERIES_TOUCHED")) {
    tasks.push(
      db.$queryRaw<{ n: number }[]>`
        SELECT count(DISTINCT c."seriesId")::int AS n
        FROM "Discovery" d JOIN "Card" c ON c.id = d."cardId"
        WHERE d."userId" = ${userId}`.then(([r]) => set("SERIES_TOUCHED", r?.n)),
    );
  }
  const tops = paramsOf(needed, "TOP_RANKED").map(Number).filter((n) => Number.isInteger(n) && n >= 1);
  if (tops.length > 0) {
    // Personnages les plus populaires possédés en ce moment (rang 1 = le plus populaire)
    const max = Math.max(...tops);
    tasks.push(
      db.$queryRaw<{ rank: number }[]>`
        SELECT DISTINCT c.rank AS rank
        FROM "UserCard" u JOIN "Card" c ON c.id = u."cardId"
        WHERE u."ownerId" = ${userId} AND c.rank IS NOT NULL AND c.rank <= ${max}`.then((rows) => {
        for (const n of tops) set(`TOP_RANKED:${n}`, rows.filter((r) => num(r.rank) <= n).length);
      }),
    );
  }
  if (want("MAX_COPIES")) {
    tasks.push(
      db.$queryRaw<{ n: number }[]>`
        SELECT coalesce(max(n), 0)::int AS n FROM (
          SELECT count(*) AS n FROM "UserCard" WHERE "ownerId" = ${userId} GROUP BY "cardId"
        ) c`.then(([r]) => set("MAX_COPIES", r?.n)),
    );
  }

  // 銭 Zeni, quotidien et missions
  if (want("RECYCLES", "RECYCLE_ZENI", "MAX_BALANCE", "ZENI_SPENT")) {
    const spend = [...SPEND_REASONS] as string[];
    tasks.push(
      db.$queryRaw<Record<string, number>[]>`
        SELECT count(*) FILTER (WHERE reason = 'DISSOLVE')::int AS recycles,
          coalesce(sum(amount) FILTER (WHERE reason = 'DISSOLVE'), 0)::float8 AS recycle_zeni,
          coalesce(max("balanceAfter"), 0)::float8 AS max_balance,
          coalesce(-sum(amount) FILTER (WHERE reason::text = ANY(${spend}) AND amount < 0), 0)::float8 AS spent
        FROM "CoinTransaction" WHERE "userId" = ${userId}`.then(async ([r]) => {
        set("RECYCLES", r?.recycles);
        set("RECYCLE_ZENI", r?.recycle_zeni);
        set("ZENI_SPENT", r?.spent);
        const user = await userTask;
        set("MAX_BALANCE", Math.max(num(r?.max_balance), user?.coins ?? 0));
      }),
    );
  }
  for (const amount of paramsOf(needed, "EXACT_BALANCE")) {
    const target = Number(amount);
    if (!Number.isInteger(target)) continue;
    tasks.push(
      Promise.all([
        db.coinTransaction.findFirst({ where: { userId, balanceAfter: target }, select: { id: true } }),
        userTask,
      ]).then(([row, user]) => set(`EXACT_BALANCE:${amount}`, row || user?.coins === target ? 1 : 0)),
    );
  }
  if (want("DAILY_DAYS", "DAILY_STREAK")) {
    tasks.push(
      db.$queryRaw<{ day: string }[]>`
        SELECT DISTINCT to_char(("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date, 'YYYY-MM-DD') AS day
        FROM "CoinTransaction" WHERE "userId" = ${userId} AND reason = 'DAILY'`.then((rows) => {
        const days = rows.map((r) => r.day);
        set("DAILY_DAYS", days.length);
        set("DAILY_STREAK", longestDayRun(days));
      }),
    );
  }
  if (want("MISSIONS")) tasks.push(db.userMission.count({ where: { userId } }).then((n) => set("MISSIONS", n)));
  if (want("PERFECT_DAY")) {
    // Un jour où le joueur a réclamé autant de missions quotidiennes qu'il y en a d'actives
    tasks.push(
      db.mission.count({ where: { active: true, period: "DAILY" } }).then(async (daily) => {
        if (daily === 0) return void set("PERFECT_DAY", 0);
        const [r] = await db.$queryRaw<{ ok: boolean }[]>`
          SELECT EXISTS (
            SELECT 1 FROM "UserMission" um JOIN "Mission" m ON m.id = um."missionId"
            WHERE um."userId" = ${userId} AND m.period = 'DAILY'
            GROUP BY um."periodKey"
            HAVING count(*) >= ${daily}
          ) AS ok`;
        set("PERFECT_DAY", r?.ok ? 1 : 0);
      }),
    );
  }

  // 市 Hôtel des ventes et Marché
  if (want("AUCTIONS_SOLD", "AUCTION_TOP_SALE", "AUCTION_SALES_TOTAL", "AUCTIONS_WON", "AUCTION_CONTESTED_WINS", "BUYOUTS")) {
    const contested = paramsOf(needed, "AUCTION_CONTESTED_WINS").map(Number).filter((n) => Number.isInteger(n) && n >= 1);
    tasks.push(
      db.$queryRaw<Record<string, number>[]>`
        SELECT count(*) FILTER (WHERE "sellerId" = ${userId})::int AS sold,
          coalesce(max("finalPrice") FILTER (WHERE "sellerId" = ${userId}), 0)::float8 AS top,
          coalesce(sum("finalPrice") FILTER (WHERE "sellerId" = ${userId}), 0)::float8 AS total,
          count(*) FILTER (WHERE "currentBidderId" = ${userId})::int AS won,
          count(*) FILTER (WHERE "currentBidderId" = ${userId} AND "buyoutPrice" IS NOT NULL AND "finalPrice" >= "buyoutPrice")::int AS buyouts
        FROM "Auction"
        WHERE status = 'SOLD' AND ("sellerId" = ${userId} OR "currentBidderId" = ${userId})`.then(([r]) => {
        set("AUCTIONS_SOLD", r?.sold);
        set("AUCTION_TOP_SALE", r?.top);
        set("AUCTION_SALES_TOTAL", r?.total);
        set("AUCTIONS_WON", r?.won);
        set("BUYOUTS", r?.buyouts);
      }),
      ...contested.map((bids) =>
        db.auction
          .count({ where: { status: "SOLD", currentBidderId: userId, bidCount: { gte: bids } } })
          .then((n) => set(`AUCTION_CONTESTED_WINS:${bids}`, n)),
      ),
    );
  }
  if (want("ORDERS_RECEIVED")) tasks.push(db.buyOrder.count({ where: { buyerId: userId, status: "FILLED" } }).then((n) => set("ORDERS_RECEIVED", n)));
  if (want("ORDERS_FILLED")) tasks.push(db.buyOrder.count({ where: { sellerId: userId, status: "FILLED" } }).then((n) => set("ORDERS_FILLED", n)));
  if (want("LISTING_TRADES")) {
    tasks.push(
      Promise.all([
        db.tradeListing.count({ where: { ownerId: userId, status: "TRADED" } }),
        db.listingOffer.count({ where: { bidderId: userId, status: "ACCEPTED" } }),
      ]).then(([own, offers]) => set("LISTING_TRADES", own + offers)),
    );
  }

  // 縁 Amis et échanges
  if (want("FRIENDS")) {
    tasks.push(
      db.friendship
        .count({ where: { status: "ACCEPTED", OR: [{ requesterId: userId }, { addresseeId: userId }] } })
        .then((n) => set("FRIENDS", n)),
    );
  }
  if (want("GIFT_CARDS", "GIFT_BOOSTERS", "GIFT_SEALED")) {
    tasks.push(
      db.gift.groupBy({ by: ["kind"], where: { senderId: userId }, _count: { _all: true } }).then((rows) => {
        const of = (kind: string) => rows.find((r) => r.kind === kind)?._count._all ?? 0;
        set("GIFT_CARDS", of("CARD"));
        set("GIFT_BOOSTERS", of("BOOSTER"));
        set("GIFT_SEALED", of("SEALED"));
      }),
    );
  }
  if (want("REFERRALS")) {
    // Amis installés, comme les paliers et les badges du parrainage (v1 qualifiés compris, v2 à l'étape 2)
    tasks.push(db.referral.count({ where: installedReferralWhere(userId) }).then((n) => set("REFERRALS", n)));
  }
  if (want("REVIEW")) tasks.push(db.review.count({ where: { userId } }).then((n) => set("REVIEW", Math.min(n, 1))));

  // 飾 Vitrines
  if (want("SHOWCASES_FULL")) {
    tasks.push(
      db.showcase.findMany({ where: { userId }, select: { layout: true, _count: { select: { items: true } } } }).then((rows) => {
        set("SHOWCASES_FULL", rows.filter((s) => isLayoutId(s.layout) && s._count.items >= layoutCapacity(s.layout)).length);
      }),
    );
  }
  if (want("EVENT_ENTRY")) tasks.push(db.showcaseEventEntry.count({ where: { userId } }).then((n) => set("EVENT_ENTRY", Math.min(n, 1))));
  if (want("EVENT_VOTE")) tasks.push(db.showcaseEventVote.count({ where: { voterId: userId } }).then((n) => set("EVENT_VOTE", Math.min(n, 1))));

  // 戦 Combat
  if (want("BATTLES", "WINS", "CRUSHING_WINS", "FRIEND_WINS", "MONO_UNIVERSE_WINS", "COMMONS_WINS")) {
    tasks.push(
      db.$queryRaw<Record<string, number>[]>`
        WITH mine AS (
          SELECT b.mode, b.crushing, b.setup,
            CASE WHEN b."p1Id" = ${userId} THEN 0 ELSE 1 END AS side,
            coalesce(b."winnerSide" = CASE WHEN b."p1Id" = ${userId} THEN 0 ELSE 1 END, false) AS won
          FROM "Battle" b
          WHERE b.status = 'FINISHED' AND (b."p1Id" = ${userId} OR b."p2Id" = ${userId})
        ), teams AS (
          SELECT m.*, m.setup -> 'teams' -> m.side AS team FROM mine m
        )
        SELECT count(*)::int AS battles,
          count(*) FILTER (WHERE won)::int AS wins,
          count(*) FILTER (WHERE won AND crushing)::int AS crushing,
          count(*) FILTER (WHERE won AND mode = 'FRIEND')::int AS friend_wins,
          count(*) FILTER (WHERE won AND jsonb_typeof(team) = 'array' AND (
            SELECT count(*) > 0 AND count(f -> 'universe' ->> 'key') = count(*) AND count(DISTINCT f -> 'universe' ->> 'key') = 1
            FROM jsonb_array_elements(team) f
          ))::int AS mono,
          count(*) FILTER (WHERE won AND jsonb_typeof(team) = 'array' AND (
            SELECT count(*) > 0 AND bool_and(f ->> 'rarity' = 'COMMON') FROM jsonb_array_elements(team) f
          ))::int AS commons
        FROM teams`.then(([r]) => {
        set("BATTLES", r?.battles);
        set("WINS", r?.wins);
        set("CRUSHING_WINS", r?.crushing);
        set("FRIEND_WINS", r?.friend_wins);
        set("MONO_UNIVERSE_WINS", r?.mono);
        set("COMMONS_WINS", r?.commons);
      }),
    );
  }
  if (want("WIN_STREAK")) {
    tasks.push(
      db.battle
        .findMany({
          where: { status: "FINISHED", OR: [{ p1Id: userId }, { p2Id: userId }] },
          orderBy: [{ endedAt: "asc" }, { createdAt: "asc" }],
          select: { p1Id: true, winnerSide: true },
        })
        .then((rows) => set("WIN_STREAK", longestRun(rows.map((b) => b.winnerSide !== null && b.winnerSide === (b.p1Id === userId ? 0 : 1))))),
    );
  }
  if (want("ABILITIES")) tasks.push(db.abilityPurchase.count({ where: { userId } }).then((n) => set("ABILITIES", n)));

  // 段 Classé
  if (want("SEASON_GAMES", "SEASONS_PLAYED")) {
    tasks.push(
      Promise.all([db.seasonResult.findMany({ where: { userId, games: { gt: 0 } }, select: { games: true } }), userTask]).then(([rows, user]) => {
        set("SEASON_GAMES", Math.max(user?.seasonGames ?? 0, ...rows.map((r) => r.games)));
        set("SEASONS_PLAYED", rows.length);
      }),
    );
  }
  if (want("SEASON_BEST")) {
    // Meilleure place de fin de saison (saisons closes), classement aux PC de fin de saison
    tasks.push(
      db.$queryRaw<{ best: number }[]>`
        SELECT coalesce(min(pos), 0)::int AS best FROM (
          SELECT "userId", rank() OVER (PARTITION BY "seasonId" ORDER BY "finalPc" DESC) AS pos
          FROM "SeasonResult"
          WHERE games > 0 AND "seasonId" IN (SELECT "seasonId" FROM "SeasonResult" WHERE "userId" = ${userId} AND games > 0)
        ) r
        WHERE "userId" = ${userId}`.then(([r]) => set("SEASON_BEST", r?.best)),
    );
  }

  // 旅 Expéditions
  if (want("EXPEDITIONS", "TRIUMPHS", "RISKY_SUCCESS")) {
    tasks.push(
      db.$queryRaw<Record<string, number>[]>`
        SELECT count(*)::int AS done,
          count(*) FILTER (WHERE e.outcome = 'TRIUMPH')::int AS triumphs,
          count(*) FILTER (WHERE t.risk = 'RISKY' AND e.outcome IN ('SUCCESS', 'TRIUMPH'))::int AS risky
        FROM "Expedition" e JOIN "ExpeditionType" t ON t.id = e."typeId"
        WHERE e."userId" = ${userId} AND e.status = 'COMPLETED'`.then(([r]) => {
        set("EXPEDITIONS", r?.done);
        set("TRIUMPHS", r?.triumphs);
        set("RISKY_SUCCESS", r?.risky);
      }),
    );
  }

  // 賭 Pile ou face
  if (want("FLIPS", "FLIP_WINS", "FLIP_WIN_STREAK", "FLIP_LOSS_STREAK", "FLIP_MYTHIC_WINS")) {
    tasks.push(
      Promise.all([
        db.coinFlip.findMany({
          where: { status: "DONE", OR: [{ creatorId: userId }, { opponentId: userId }] },
          orderBy: [{ resolvedAt: "asc" }, { createdAt: "asc" }],
          select: { winnerId: true, tierOrder: true },
        }),
        db.rarityDefinition.findUnique({ where: { key: "MYTHIC" }, select: { sortOrder: true } }),
      ]).then(([flips, mythic]) => {
        const won = flips.map((f) => f.winnerId === userId);
        set("FLIPS", flips.length);
        set("FLIP_WINS", won.filter(Boolean).length);
        set("FLIP_WIN_STREAK", longestRun(won));
        set("FLIP_LOSS_STREAK", longestRun(won.map((w) => !w)));
        set("FLIP_MYTHIC_WINS", mythic ? flips.filter((f) => f.winnerId === userId && f.tierOrder >= mythic.sortOrder).length : 0);
      }),
    );
  }

  // 転 Prestige
  if (want("HERITAGE_MAX", "SERIAL_ONE")) {
    tasks.push(
      db.$queryRaw<{ heritage: number; serial_one: boolean }[]>`
        SELECT greatest(
            (SELECT coalesce(max(heritage), 0) FROM "UserCard" WHERE "ownerId" = ${userId}),
            (SELECT coalesce(max(heritage), 0) FROM "ConsecratedCard" WHERE "userId" = ${userId})
          )::int AS heritage,
          (EXISTS (SELECT 1 FROM "UserCard" WHERE "ownerId" = ${userId} AND serial = 1)
            OR EXISTS (SELECT 1 FROM "ConsecratedCard" WHERE "userId" = ${userId} AND serial = 1)) AS serial_one`.then(([r]) => {
        set("HERITAGE_MAX", r?.heritage);
        set("SERIAL_ONE", r?.serial_one ? 1 : 0);
      }),
    );
  }

  // 歳 Ancienneté
  if (want("KYARA_IMPORT")) tasks.push(db.kyaraImport.count({ where: { userId, status: "DONE" } }).then((n) => set("KYARA_IMPORT", Math.min(n, 1))));

  // Champs du joueur
  if (want("INCENSE", "DISCORD_LINKED", "FULL_STYLE", "ACCOUNT_DAYS")) {
    tasks.push(
      userTask.then((user) => {
        if (!user) return;
        set("INCENSE", user.incenseUsed);
        set("DISCORD_LINKED", user.discordLinkedAt ? 1 : 0);
        set("FULL_STYLE", user.titleId && user.frameId && user.nameColorId ? 1 : 0);
        set("ACCOUNT_DAYS", Math.max(0, Math.floor((ctx.now.getTime() - user.createdAt.getTime()) / DAY_MS)));
      }),
    );
  }

  await Promise.all(tasks);
  return { values, goals };
}
