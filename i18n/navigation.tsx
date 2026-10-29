import type { ComponentProps } from "react";
import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

const navigation = createNavigation(routing);

export const { redirect, usePathname, useRouter, getPathname } = navigation;

/**
 * Lien localisé, sans préchargement par défaut. Toutes les pages sont dynamiques (nonce CSP) : chaque
 * lien préchargé coûtait une à deux requêtes rendues par le serveur dès qu'il approchait de l'écran,
 * des dizaines par page (grilles, classement, pied de page). `prefetch` le réactive au cas par cas.
 */
export function Link({ prefetch = false, ...props }: ComponentProps<typeof navigation.Link>) {
  return <navigation.Link prefetch={prefetch} {...props} />;
}
