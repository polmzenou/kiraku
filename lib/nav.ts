// Navigation desktop en haut, navigation mobile en bas (< 1024 px).
// `ready: false` : la page arrive à une étape suivante, l'entrée s'affiche avec « Bientôt ».
// NAV_MORE : entrées rangées dans le menu déroulant « Plus », après Marché.

export type NavKey = "boosters" | "missions" | "shop" | "referral" | "combat" | "market" | "collection" | "friends" | "wiki";

export type NavItem = { key: NavKey; href: string; ready: boolean; also?: readonly string[] };

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
};

export const NAV_ITEMS: readonly NavItem[] = [ENTRIES.boosters, ENTRIES.missions, ENTRIES.shop, ENTRIES.combat, ENTRIES.market];

export const NAV_MORE: readonly NavItem[] = [
  ENTRIES.collection, ENTRIES.friends, ENTRIES.referral, ENTRIES.wiki,
];

export const MOBILE_NAV_ITEMS: readonly NavItem[] = [
  ENTRIES.boosters, ENTRIES.collection, ENTRIES.combat, ENTRIES.market,
];

export const MOBILE_NAV_MORE: readonly NavItem[] = [
  ENTRIES.missions, ENTRIES.shop, ENTRIES.friends, ENTRIES.referral, ENTRIES.wiki,
];

/** L'entrée correspond-elle au chemin courant (sans préfixe de langue) ? */
export function isActive(item: NavItem, pathname: string): boolean {
  return [item.href, ...(item.also ?? [])].some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
