// Objets schema.org (JSON-LD) des pages publiques. Fonctions pures : l'origine est passée en
// paramètre (appUrl côté serveur), les chemins viennent de localePath.

import { X_URL } from "../links";

export type StructuredData = { "@type": string } & Record<string, unknown>;

type Crumb = { name: string; path: string };

/** Accueil : le site, l'éditeur et le jeu lui-même (gratuit, dans le navigateur). */
export function homeGraph(origin: string, home: string, { name, description, language }: { name: string; description: string; language: string }): StructuredData[] {
  const url = `${origin}${home}`;
  const organization = { "@id": `${origin}/#organization` };
  return [
    { "@type": "WebSite", "@id": `${origin}/#website`, name, url, inLanguage: language, publisher: organization },
    { "@type": "Organization", "@id": organization["@id"], name, url: origin, logo: `${origin}/icons/icon-512.png`, sameAs: [X_URL] },
    {
      "@type": "WebApplication",
      name,
      url,
      description,
      inLanguage: language,
      applicationCategory: "GameApplication",
      operatingSystem: "Web",
      offers: { "@type": "Offer", price: 0, priceCurrency: "EUR" },
      publisher: organization,
    },
  ];
}

/** Fil d'Ariane ; le dernier élément est la page courante. */
export function breadcrumbs(origin: string, crumbs: readonly Crumb[]): StructuredData {
  return {
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, i) => ({ "@type": "ListItem", position: i + 1, name: crumb.name, item: `${origin}${crumb.path}` })),
  };
}
