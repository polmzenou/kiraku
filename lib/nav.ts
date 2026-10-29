// Navigation desktop en haut, navigation mobile en bas (< 1024 px).
// `ready: false` : la page arrive à une étape suivante, l'entrée s'affiche avec « Bientôt ».
// NAV_MORE : entrées rangées dans le menu déroulant « Plus », après Marché.
// `soon` : page d'attente accessible, marquée « Bientôt » ; `feature` : masquée si l'interrupteur admin est coupé.

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
  | "casino";

export type NavFeature = "casino";
/** Entrées qui attendent une action du joueur (pastille rouge), ex. une mission à réclamer. */
export type NavAlerts = Partial<Record<NavKey, boolean>>;
export type NavFeatures = Record<NavFeature, boolean>;

export type NavItem = {
  key: NavKey;
  href: string;
  ready: boolean;
  soon?: boolean;
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
  casino: { key: "casino", href: "/casino", ready: true, soon: true, feature: "casino" },
};

export const NAV_ITEMS: readonly NavItem[] = [ENTRIES.boosters, ENTRIES.missions, ENTRIES.shop, ENTRIES.combat, ENTRIES.market];

export const NAV_MORE: readonly NavItem[] = [
  ENTRIES.collection, ENTRIES.friends, ENTRIES.referral, ENTRIES.wiki, ENTRIES.casino,
];

export const MOBILE_NAV_ITEMS: readonly NavItem[] = [
  ENTRIES.boosters, ENTRIES.collection, ENTRIES.combat, ENTRIES.market,
];

export const MOBILE_NAV_MORE: readonly NavItem[] = [
  ENTRIES.missions, ENTRIES.shop, ENTRIES.friends, ENTRIES.referral, ENTRIES.wiki, ENTRIES.casino,
];

/** Entrées dont l'interrupteur est allumé (ou qui n'en ont pas). */
export function visibleItems(items: readonly NavItem[], features: NavFeatures): NavItem[] {
  return items.filter((item) => !item.feature || features[item.feature]);
}

/** L'entrée correspond-elle au chemin courant (sans préfixe de langue) ? */
export function isActive(item: NavItem, pathname: string): boolean {
  return [item.href, ...(item.also ?? [])].some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
