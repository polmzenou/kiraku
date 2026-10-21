import type { StructuredData } from "@/lib/seo/structured-data";

/**
 * Données structurées schema.org. Seule exception à la règle « pas de dangerouslySetInnerHTML »
 * hors markdown légal : un bloc de données (non exécuté, donc hors CSP), construit côté serveur à
 * partir d'objets typés, avec `<` échappé pour qu'aucune valeur ne puisse fermer la balise.
 */
export function JsonLd({ data }: { data: StructuredData | StructuredData[] }) {
  const json = JSON.stringify(Array.isArray(data) ? { "@context": "https://schema.org", "@graph": data } : { "@context": "https://schema.org", ...data });
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json.replace(/</g, "\\u003c") }} />;
}
