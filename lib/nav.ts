// Navigation desktop (≥ 1024 px) : barre du haut à menus groupés (NAV_ITEMS + NAV_GROUPS) ou barre
// latérale (RAIL_GROUPS), au choix du joueur (lib/nav-layout.ts) ; navigation mobile en bas (< 1024 px).
// `ready: false` : la page arrive à une étape suivante, l'entrée s'affiche avec « Bientôt ».
// `feature` : masquée si l'interrupteur admin est coupé. Les pastilles « Bientôt » / « Nouveau » d'une entrée
// accessible (casino : teaser, puis lancement) sont calculées par le serveur (NavBadges).

/** Bloc du contenu (sous l'en-tête), cible du lien d'évitement « Aller au contenu » de l'en-tête. */
export const MAIN_CONTENT_ID = "contenu";

export type NavKey =
  | "boosters"
  | "missions"
  | "shop"
  | "referral"
  | "combat"
  | "market"
  | "collection"
  | "friends"
  | "wiki"
  | "social"
  | "event"
  | "expedition"
  | "casino";

// `event` : event en cours (/event), affiché seulement quand l'admin l'allume ; `expedition` : idem pour /expedition
export type NavFeature = "casino" | "event" | "expedition";
/** Entrées qui attendent une action du joueur (pastille rouge), ex. une mission à réclamer. */
export type NavAlerts = Partial<Record<NavKey, boolean>>;
export type NavFeatures = Record<NavFeature, boolean>;
/** Pastille d'une entrée accessible : page d'attente (« Bientôt ») ou nouveauté (« Nouveau »). */
export type NavBadge = "soon" | "new";
export type NavBadges = Partial<Record<NavKey, NavBadge>>;

export type NavItem = {
  key: NavKey;
  href: string;
  ready: boolean;
  feature?: NavFeature;
  also?: readonly string[];
};

const ENTRIES: Record<NavKey, NavItem> = {
  boosters: { key: "boosters", href: "/", ready: true, also: ["/ouvrir", "/tirage"] },
  missions: { key: "missions", href: "/missions", ready: true },
  shop: { key: "shop", href: "/boutique", ready: true },
  combat: { key: "combat", href: "/combat", ready: true },
  market: { key: "market", href: "/marche", ready: true },
  collection: { key: "collection", href: "/collection", ready: true },
  friends: { key: "friends", href: "/amis", ready: true, also: ["/u"] },
  referral: { key: "referral", href: "/parrainage", ready: true, also: ["/i"] },
  wiki: { key: "wiki", href: "/wiki", ready: true },
  social: { key: "social", href: "/social", ready: true },
  event: { key: "event", href: "/event", ready: true, feature: "event" },
  expedition: { key: "expedition", href: "/expedition", ready: true, feature: "expedition" },
  casino: { key: "casino", href: "/casino", ready: true, feature: "casino" },
};

/** Kanji de chaque entrée, pris dans lib/seal-glyphs.ts (la police des sceaux n'a que ceux-là). */
export const NAV_KANJI: Record<NavKey, string> = {
  boosters: "封",
  collection: "蒐",
  missions: "任",
  combat: "戦",
  expedition: "遠",
  casino: "賭",
  shop: "店",
  market: "売",
  event: "催",
  friends: "友",
  social: "訪",
  referral: "招",
  wiki: "札",
};

export type NavGroupKey = "play" | "trade" | "community";
export type NavGroup = { key: NavGroupKey; kanji: string; items: readonly NavItem[] };

/** Barre du haut : la boucle principale (ouvrir, collectionner) en accès direct… */
export const NAV_ITEMS: readonly NavItem[] = [ENTRIES.boosters, ENTRIES.collection];

/** …puis un menu par intention : jouer, échanger, retrouver les autres joueurs. */
export const NAV_GROUPS: readonly NavGroup[] = [
  { key: "play", kanji: "楽", items: [ENTRIES.combat, ENTRIES.expedition, ENTRIES.missions, ENTRIES.casino] },
  { key: "trade", kanji: "商", items: [ENTRIES.shop, ENTRIES.market] },
  { key: "community", kanji: "和", items: [ENTRIES.event, ENTRIES.friends, ENTRIES.social, ENTRIES.referral, ENTRIES.wiki] },
];

/** Barre latérale : toutes les entrées à plat, en blocs séparés par un filet. */
export const RAIL_GROUPS: readonly (readonly NavItem[])[] = [
  [ENTRIES.boosters, ENTRIES.collection, ENTRIES.missions],
  [ENTRIES.combat, ENTRIES.expedition, ENTRIES.casino],
  [ENTRIES.shop, ENTRIES.market],
  [ENTRIES.event, ENTRIES.friends, ENTRIES.social, ENTRIES.referral, ENTRIES.wiki],
];

export const MOBILE_NAV_ITEMS: readonly NavItem[] = [
  ENTRIES.boosters, ENTRIES.collection, ENTRIES.combat, ENTRIES.market,
];

export const MOBILE_NAV_MORE: readonly NavItem[] = [
  ENTRIES.event, ENTRIES.expedition, ENTRIES.missions, ENTRIES.shop, ENTRIES.friends, ENTRIES.referral, ENTRIES.wiki, ENTRIES.social, ENTRIES.casino,
];

/** Entrées dont l'interrupteur est allumé (ou qui n'en ont pas). */
export function visibleItems(items: readonly NavItem[], features: NavFeatures): NavItem[] {
  return items.filter((item) => !item.feature || features[item.feature]);
}

/** L'entrée correspond-elle au chemin courant (sans préfixe de langue) ? */
export function isActive(item: NavItem, pathname: string): boolean {
  return [item.href, ...(item.also ?? [])].some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
