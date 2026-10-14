// Entrées de la navigation principale (barre du haut ≥ 1024 px, menu burger en dessous).
// `ready: false` : la page arrive à une étape suivante, l'entrée s'affiche avec « Bientôt ».
// NAV_MORE : entrées rangées dans le menu déroulant « Plus », après Marché.

export type NavKey = "boosters" | "missions" | "shop" | "referral" | "combat" | "market" | "collection" | "friends" | "wiki";

export type NavItem = { key: NavKey; href: string; ready: boolean; also?: readonly string[] };

export const NAV_ITEMS: readonly NavItem[] = [
  { key: "boosters", href: "/", ready: true, also: ["/ouvrir", "/tirage"] },
  { key: "missions", href: "/missions", ready: true },
  { key: "shop", href: "/boutique", ready: true },
  { key: "referral", href: "/parrainage", ready: true, also: ["/i"] },
  { key: "combat", href: "/combat", ready: false },
  { key: "market", href: "/marche", ready: false },
];

export const NAV_MORE: readonly NavItem[] = [
  { key: "collection", href: "/collection", ready: true },
  { key: "friends", href: "/amis", ready: true, also: ["/u"] },
  { key: "wiki", href: "/wiki", ready: true },
];

/** L'entrée correspond-elle au chemin courant (sans préfixe de langue) ? */
export function isActive(item: NavItem, pathname: string): boolean {
  return [item.href, ...(item.also ?? [])].some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
