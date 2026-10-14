// Entrées de la navigation principale (barre du haut ≥ 768 px, menu burger en dessous).
// `ready: false` : la page arrive à une étape suivante, l'entrée s'affiche avec « Bientôt ».

export type NavKey = "boosters" | "collection" | "combat" | "market" | "wiki";

export type NavItem = { key: NavKey; href: string; ready: boolean; also?: readonly string[] };

export const NAV_ITEMS: readonly NavItem[] = [
  { key: "boosters", href: "/", ready: true, also: ["/ouvrir", "/tirage"] },
  { key: "collection", href: "/collection", ready: false },
  { key: "combat", href: "/combat", ready: false },
  { key: "market", href: "/marche", ready: false },
  { key: "wiki", href: "/wiki", ready: true },
];

/** L'entrée correspond-elle au chemin courant (sans préfixe de langue) ? */
export function isActive(item: NavItem, pathname: string): boolean {
  return [item.href, ...(item.also ?? [])].some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
