// Catalogue des succès (honorifiques, sans récompense). Les textes sont dans messages/{fr,en}.json
// (achievements.items.<key>.name et .desc, avec {count}) ; les seuils se règlent dans l'admin (achievements.goals)
// et un succès s'y désactive (achievements.disabled). Fonctions pures : importable côté client.

/** Catégories, dans l'ordre de la page, avec leur kanji de sceau (lib/seal-glyphs.ts). */
export const ACHIEVEMENT_CATEGORIES = [
  "boosters",
  "collection",
  "zeni",
  "market",
  "social",
  "showcase",
  "combat",
  "ranked",
  "expedition",
  "casino",
  "prestige",
  "seniority",
  "secret",
] as const;
export type AchievementCategory = (typeof ACHIEVEMENT_CATEGORIES)[number];

export const CATEGORY_KANJI: Record<AchievementCategory, string> = {
  boosters: "開",
  collection: "集",
  zeni: "銭",
  market: "市",
  social: "縁",
  showcase: "飾",
  combat: "戦",
  ranked: "段",
  expedition: "旅",
  casino: "賭",
  prestige: "転",
  seniority: "歳",
  secret: "秘",
};

/** Rang d'un succès = matière d'une rareté de base : sceau, couleur de la tuile et ordre de tri (1 facile, 6 très dur). */
export const ACHIEVEMENT_RANKS = [1, 2, 3, 4, 5, 6] as const;
export type AchievementRank = (typeof ACHIEVEMENT_RANKS)[number];
export const RANK_SEAL: Record<AchievementRank, string> = { 1: "並", 2: "良", 3: "稀", 4: "秀", 5: "金", 6: "神" };
/** Clé de rareté dont le rang reprend la couleur (--color-rarity-*). */
export const RANK_RARITY: Record<AchievementRank, string> = { 1: "COMMON", 2: "UNCOMMON", 3: "RARE", 4: "EPIC", 5: "LEGENDARY", 6: "MYTHIC" };

/**
 * Comment se lit la valeur d'une métrique :
 * - count : compteur, barre « valeur / seuil » ;
 * - level : palier (rang du classé), débloqué quand la valeur atteint le seuil, sans barre chiffrée ;
 * - flag : fait ou pas (0 ou 1) ;
 * - position : meilleure place (0 = jamais classé), débloqué quand elle est au plus le seuil ;
 * - event : seulement débloqué par un crochet au moment où ça arrive (pas d'historique à relire).
 */
export type MetricKind = "count" | "level" | "flag" | "position" | "event";

export const METRIC_KIND = {
  // Boosters
  OPENINGS: "count",
  GOLDEN: "count",
  DIVINE: "count",
  APOC_SPARED: "count",
  APOC_RUINED: "count",
  PITY: "count",
  FEATURED: "count",
  SHAPE: "count",
  BOOSTER_TYPES: "count",
  INCENSE: "count",
  // Collection
  UNIQUE_CARDS: "count",
  CATALOG_PERCENT: "count",
  RARITY: "count",
  ALL_VARIANTS: "count",
  VARIANT_FAMILY: "count",
  SERIES_COMPLETED: "count",
  SERIES_TOUCHED: "count",
  TOP_RANKED: "count",
  MAX_COPIES: "count",
  WISH_GRANTED: "event",
  // Zeni, quotidien et missions
  RECYCLES: "count",
  RECYCLE_ZENI: "count",
  MAX_BALANCE: "count",
  ZENI_SPENT: "count",
  DAILY_DAYS: "count",
  DAILY_STREAK: "count",
  MISSIONS: "count",
  PERFECT_DAY: "flag",
  // Hôtel des ventes et Marché
  AUCTIONS_SOLD: "count",
  AUCTION_TOP_SALE: "count",
  AUCTION_SALES_TOTAL: "count",
  AUCTIONS_WON: "count",
  AUCTION_CONTESTED_WINS: "count",
  BUYOUTS: "count",
  ORDERS_RECEIVED: "count",
  ORDERS_FILLED: "count",
  LISTING_TRADES: "count",
  // Amis et échanges
  FRIENDS: "count",
  TRADES: "count",
  GIFT_CARDS: "count",
  GIFT_BOOSTERS: "count",
  GIFT_SEALED: "count",
  REFERRALS: "count",
  DISCORD_LINKED: "flag",
  REVIEW: "flag",
  // Vitrines et profil
  SHOWCASES_FULL: "count",
  EVENT_ENTRY: "flag",
  EVENT_VOTE: "flag",
  FULL_STYLE: "flag",
  // Combat
  BATTLES: "count",
  WINS: "count",
  CRUSHING_WINS: "count",
  WIN_STREAK: "count",
  FRIEND_WINS: "count",
  MONO_UNIVERSE_WINS: "count",
  COMMONS_WINS: "count",
  ABILITIES: "count",
  // Classé
  RANK_TIER: "level",
  SEASON_GAMES: "count",
  SEASONS_PLAYED: "count",
  SEASON_BEST: "position",
  // Expéditions
  EXPEDITIONS: "count",
  TRIUMPHS: "count",
  RISKY_SUCCESS: "count",
  // Pile ou face
  FLIPS: "count",
  FLIP_WINS: "count",
  FLIP_WIN_STREAK: "count",
  FLIP_MYTHIC_WINS: "count",
  // Prestige
  PRESTIGE: "count",
  HERITAGE_MAX: "count",
  CONSECRATED: "count",
  PRINTINGS: "count",
  SERIAL_ONE: "flag",
  // Ancienneté
  ACCOUNT_DAYS: "count",
  KYARA_IMPORT: "flag",
  // Secrets
  BIRTHDAY_PULL: "flag",
  NIGHT_OPENING: "flag",
  DOUBLE_MYTHIC: "flag",
  APOC_RUINED_STREAK: "count",
  EXACT_BALANCE: "flag",
  FLIP_LOSS_STREAK: "count",
  MYTHIC_RECYCLED: "event",
} as const satisfies Record<string, MetricKind>;
export type AchievementMetric = keyof typeof METRIC_KIND;

export type AchievementDef = {
  key: string;
  category: AchievementCategory;
  rank: AchievementRank;
  metric: AchievementMetric;
  /** Précision de la métrique : rareté, forme de booster, palier de popularité, heure, montant… */
  param?: string;
  /** Seuil par défaut (1 pour un flag ou un event). */
  goal: number;
  /** Seuil figé : ni réglable dans l'admin (palier de rang, plafond d'héritage, 1re place…). */
  fixed?: boolean;
  /** Caché (« ??? ») tant qu'il n'est pas débloqué. */
  secret?: boolean;
};

type Extra = Pick<AchievementDef, "param" | "fixed" | "secret">;
const def = (key: string, category: AchievementCategory, rank: AchievementRank, metric: AchievementMetric, goal = 1, extra: Extra = {}): AchievementDef => ({
  key,
  category,
  rank,
  metric,
  goal,
  ...extra,
});

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  // 開 Boosters
  def("booster-1", "boosters", 1, "OPENINGS", 1),
  def("booster-50", "boosters", 1, "OPENINGS", 50),
  def("booster-250", "boosters", 2, "OPENINGS", 250),
  def("booster-1000", "boosters", 3, "OPENINGS", 1_000),
  def("booster-5000", "boosters", 4, "OPENINGS", 5_000),
  def("booster-10000", "boosters", 5, "OPENINGS", 10_000),
  def("golden-1", "boosters", 2, "GOLDEN", 1),
  def("golden-25", "boosters", 4, "GOLDEN", 25),
  def("divine-1", "boosters", 3, "DIVINE", 1),
  def("divine-10", "boosters", 5, "DIVINE", 10),
  def("apocalypse-spared", "boosters", 3, "APOC_SPARED", 1),
  def("apocalypse-ruined", "boosters", 2, "APOC_RUINED", 1),
  def("apocalypse-ruined-10", "boosters", 4, "APOC_RUINED", 10),
  def("pity", "boosters", 2, "PITY", 1),
  def("featured-1", "boosters", 2, "FEATURED", 1),
  def("featured-25", "boosters", 4, "FEATURED", 25),
  def("pochibukuro", "boosters", 1, "SHAPE", 1, { param: "POCHIBUKURO" }),
  def("jubako", "boosters", 2, "SHAPE", 1, { param: "JUBAKO" }),
  def("booster-types-15", "boosters", 3, "BOOSTER_TYPES", 15),
  def("incense-1", "boosters", 1, "INCENSE", 1),
  def("incense-25", "boosters", 4, "INCENSE", 25),

  // 集 Collection
  def("unique-10", "collection", 1, "UNIQUE_CARDS", 10),
  def("unique-100", "collection", 1, "UNIQUE_CARDS", 100),
  def("unique-500", "collection", 2, "UNIQUE_CARDS", 500),
  def("catalog-10", "collection", 2, "CATALOG_PERCENT", 10),
  def("catalog-25", "collection", 3, "CATALOG_PERCENT", 25),
  def("catalog-50", "collection", 4, "CATALOG_PERCENT", 50),
  def("catalog-75", "collection", 5, "CATALOG_PERCENT", 75),
  def("catalog-100", "collection", 6, "CATALOG_PERCENT", 100, { fixed: true }),
  def("first-rare", "collection", 1, "RARITY", 1, { param: "RARE" }),
  def("first-epic", "collection", 2, "RARITY", 1, { param: "EPIC" }),
  def("first-legendary", "collection", 3, "RARITY", 1, { param: "LEGENDARY" }),
  def("first-mythic", "collection", 4, "RARITY", 1, { param: "MYTHIC" }),
  def("mythic-10", "collection", 5, "RARITY", 10, { param: "MYTHIC" }),
  def("mythic-50", "collection", 6, "RARITY", 50, { param: "MYTHIC" }),
  def("first-br", "collection", 3, "RARITY", 1, { param: "BR" }),
  def("first-ar", "collection", 3, "RARITY", 1, { param: "AR" }),
  def("first-vr", "collection", 4, "RARITY", 1, { param: "VR" }),
  def("first-gold", "collection", 4, "RARITY", 1, { param: "GOLD" }),
  def("first-mr", "collection", 4, "RARITY", 1, { param: "MR" }),
  def("first-sr", "collection", 5, "RARITY", 1, { param: "SR" }),
  def("first-xr", "collection", 6, "RARITY", 1, { param: "XR" }),
  // Seuil = nombre de raretés de variante du registre (fourni par les statistiques)
  def("all-variants", "collection", 6, "ALL_VARIANTS", 7, { fixed: true }),
  def("variant-family", "collection", 5, "VARIANT_FAMILY", 3),
  def("series-1", "collection", 2, "SERIES_COMPLETED", 1),
  def("series-10", "collection", 3, "SERIES_COMPLETED", 10),
  def("series-50", "collection", 4, "SERIES_COMPLETED", 50),
  def("series-150", "collection", 5, "SERIES_COMPLETED", 150),
  def("series-touched-100", "collection", 3, "SERIES_TOUCHED", 100),
  def("top-1", "collection", 3, "TOP_RANKED", 1, { param: "1", fixed: true }),
  def("top-10", "collection", 5, "TOP_RANKED", 10, { param: "10", fixed: true }),
  def("copies-10", "collection", 2, "MAX_COPIES", 10),
  def("wish-granted", "collection", 2, "WISH_GRANTED"),

  // 銭 Zeni, quotidien et missions
  def("recycle-1", "zeni", 1, "RECYCLES", 1),
  def("recycle-zeni-50k", "zeni", 3, "RECYCLE_ZENI", 50_000),
  def("recycle-zeni-1m", "zeni", 5, "RECYCLE_ZENI", 1_000_000),
  def("balance-10k", "zeni", 1, "MAX_BALANCE", 10_000),
  def("balance-100k", "zeni", 3, "MAX_BALANCE", 100_000),
  def("balance-1m", "zeni", 5, "MAX_BALANCE", 1_000_000),
  def("spent-100k", "zeni", 3, "ZENI_SPENT", 100_000),
  def("daily-7", "zeni", 1, "DAILY_DAYS", 7),
  def("daily-30", "zeni", 2, "DAILY_DAYS", 30),
  def("daily-100", "zeni", 3, "DAILY_DAYS", 100),
  def("daily-365", "zeni", 4, "DAILY_DAYS", 365),
  def("daily-streak-7", "zeni", 2, "DAILY_STREAK", 7),
  def("daily-streak-30", "zeni", 4, "DAILY_STREAK", 30),
  def("missions-10", "zeni", 1, "MISSIONS", 10),
  def("missions-100", "zeni", 2, "MISSIONS", 100),
  def("missions-500", "zeni", 3, "MISSIONS", 500),
  def("perfect-day", "zeni", 2, "PERFECT_DAY"),

  // 市 Hôtel des ventes et Marché
  def("auction-sold-1", "market", 1, "AUCTIONS_SOLD", 1),
  def("auction-sold-25", "market", 2, "AUCTIONS_SOLD", 25),
  def("auction-sold-250", "market", 4, "AUCTIONS_SOLD", 250),
  def("auction-top-sale", "market", 3, "AUCTION_TOP_SALE", 50_000),
  def("auction-sales-1m", "market", 5, "AUCTION_SALES_TOTAL", 1_000_000),
  def("auction-won-1", "market", 1, "AUCTIONS_WON", 1),
  def("auction-won-25", "market", 3, "AUCTIONS_WON", 25),
  // param : mises reçues par la vente remportée
  def("auction-contested", "market", 3, "AUCTION_CONTESTED_WINS", 1, { param: "10" }),
  def("buyout", "market", 1, "BUYOUTS", 1),
  def("order-received", "market", 2, "ORDERS_RECEIVED", 1),
  def("orders-filled-10", "market", 3, "ORDERS_FILLED", 10),
  def("listing-trade", "market", 1, "LISTING_TRADES", 1),

  // 縁 Amis et échanges
  def("friends-1", "social", 1, "FRIENDS", 1),
  def("friends-10", "social", 2, "FRIENDS", 10),
  def("friends-50", "social", 3, "FRIENDS", 50),
  def("trades-1", "social", 1, "TRADES", 1),
  def("trades-25", "social", 2, "TRADES", 25),
  def("trades-100", "social", 4, "TRADES", 100),
  def("gift-card-1", "social", 1, "GIFT_CARDS", 1),
  def("gift-card-50", "social", 3, "GIFT_CARDS", 50),
  def("gift-booster-25", "social", 3, "GIFT_BOOSTERS", 25),
  def("gift-sealed", "social", 2, "GIFT_SEALED", 1),
  def("referral-1", "social", 2, "REFERRALS", 1),
  def("referral-5", "social", 3, "REFERRALS", 5),
  def("referral-20", "social", 5, "REFERRALS", 20),
  def("discord", "social", 1, "DISCORD_LINKED"),
  def("review", "social", 1, "REVIEW"),

  // 飾 Vitrines et profil
  def("showcase-full-1", "showcase", 1, "SHOWCASES_FULL", 1),
  def("showcase-full-6", "showcase", 3, "SHOWCASES_FULL", 6),
  def("event-entry", "showcase", 2, "EVENT_ENTRY"),
  def("event-vote", "showcase", 1, "EVENT_VOTE"),
  def("full-style", "showcase", 2, "FULL_STYLE"),

  // 戦 Combat
  def("battle-1", "combat", 1, "BATTLES", 1),
  def("win-1", "combat", 1, "WINS", 1),
  def("win-25", "combat", 2, "WINS", 25),
  def("win-100", "combat", 3, "WINS", 100),
  def("win-500", "combat", 4, "WINS", 500),
  def("win-2000", "combat", 5, "WINS", 2_000),
  def("crushing-1", "combat", 2, "CRUSHING_WINS", 1),
  def("crushing-25", "combat", 4, "CRUSHING_WINS", 25),
  def("win-streak-5", "combat", 3, "WIN_STREAK", 5),
  def("win-streak-10", "combat", 5, "WIN_STREAK", 10),
  def("friend-win", "combat", 1, "FRIEND_WINS", 1),
  def("mono-universe-win", "combat", 2, "MONO_UNIVERSE_WINS", 1),
  def("commons-win", "combat", 4, "COMMONS_WINS", 1),
  def("ability-1", "combat", 1, "ABILITIES", 1),
  def("ability-50", "combat", 3, "ABILITIES", 50),

  // 段 Classé (valeur = position du rang dans BOARD_TIERS, Bronze = 1)
  def("tier-silver", "ranked", 1, "RANK_TIER", 2, { fixed: true }),
  def("tier-gold", "ranked", 2, "RANK_TIER", 3, { fixed: true }),
  def("tier-emerald", "ranked", 3, "RANK_TIER", 4, { fixed: true }),
  def("tier-elite", "ranked", 4, "RANK_TIER", 5, { fixed: true }),
  def("tier-champion", "ranked", 5, "RANK_TIER", 6, { fixed: true }),
  def("tier-grand-champion", "ranked", 6, "RANK_TIER", 7, { fixed: true }),
  def("season-games-50", "ranked", 2, "SEASON_GAMES", 50),
  def("seasons-5", "ranked", 3, "SEASONS_PLAYED", 5),
  def("season-top-100", "ranked", 4, "SEASON_BEST", 100),
  def("season-top-10", "ranked", 5, "SEASON_BEST", 10),
  def("season-first", "ranked", 6, "SEASON_BEST", 1, { fixed: true }),

  // 旅 Expéditions
  def("expedition-1", "expedition", 1, "EXPEDITIONS", 1),
  def("expedition-25", "expedition", 2, "EXPEDITIONS", 25),
  def("expedition-200", "expedition", 4, "EXPEDITIONS", 200),
  def("triumph-1", "expedition", 2, "TRIUMPHS", 1),
  def("triumph-25", "expedition", 3, "TRIUMPHS", 25),
  def("risky-success", "expedition", 3, "RISKY_SUCCESS", 1),

  // 賭 Pile ou face
  def("coinflip-1", "casino", 1, "FLIPS", 1),
  def("coinflip-win-10", "casino", 2, "FLIP_WINS", 10),
  def("coinflip-streak-5", "casino", 4, "FLIP_WIN_STREAK", 5),
  def("coinflip-mythic", "casino", 5, "FLIP_MYTHIC_WINS", 1),

  // 転 Prestige
  def("prestige-1", "prestige", 4, "PRESTIGE", 1),
  def("prestige-3", "prestige", 5, "PRESTIGE", 3),
  def("prestige-5", "prestige", 6, "PRESTIGE", 5),
  def("heritage-max", "prestige", 5, "HERITAGE_MAX", 5, { fixed: true }),
  def("consecrated-1", "prestige", 5, "CONSECRATED", 1),
  def("consecrated-5", "prestige", 6, "CONSECRATED", 5),
  def("printings-10", "prestige", 4, "PRINTINGS", 10),
  def("serial-one", "prestige", 5, "SERIAL_ONE"),

  // 歳 Ancienneté
  def("account-30", "seniority", 1, "ACCOUNT_DAYS", 30),
  def("account-365", "seniority", 4, "ACCOUNT_DAYS", 365),
  def("kyara-import", "seniority", 2, "KYARA_IMPORT"),

  // 秘 Secrets
  def("birthday-pull", "secret", 3, "BIRTHDAY_PULL", 1, { secret: true }),
  // param : heure de début (fuseau du jeu), l'heure suivante comprise jusqu'à sa fin
  def("night-owl", "secret", 2, "NIGHT_OPENING", 1, { param: "3", secret: true }),
  def("double-mythic", "secret", 6, "DOUBLE_MYTHIC", 1, { secret: true }),
  def("cursed", "secret", 4, "APOC_RUINED_STREAK", 3, { secret: true }),
  def("jackpot", "secret", 3, "EXACT_BALANCE", 1, { param: "77777", secret: true }),
  def("bad-luck", "secret", 2, "FLIP_LOSS_STREAK", 5, { secret: true }),
  def("sacrilege", "secret", 2, "MYTHIC_RECYCLED", 1, { secret: true }),
];

export const ACHIEVEMENT_KEYS = ACHIEVEMENTS.map((a) => a.key);
const BY_KEY = new Map(ACHIEVEMENTS.map((a) => [a.key, a]));

export function achievementByKey(key: string): AchievementDef | undefined {
  return BY_KEY.get(key);
}

export function metricKind(a: Pick<AchievementDef, "metric">): MetricKind {
  return METRIC_KIND[a.metric];
}

/** Le seuil se règle dans l'admin : compteur ou place, sans seuil figé. */
export function isAdjustable(a: AchievementDef): boolean {
  const kind = metricKind(a);
  return !a.fixed && (kind === "count" || kind === "position");
}

/** Clé de la statistique lue par un succès : la métrique, précisée par son paramètre. */
export function statKey(a: Pick<AchievementDef, "metric" | "param">): string {
  return a.param ? `${a.metric}:${a.param}` : a.metric;
}
