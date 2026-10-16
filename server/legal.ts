import "server-only";
import { unstable_cache } from "next/cache";
import { pickLegalDocument, type LegalRow, type LegalSlug } from "@/lib/legal/legal";
import { prisma } from "./db";

export const LEGAL_TAG = "legal";

// Versions publiées d'une page (toutes langues), en cache jusqu'à la prochaine publication
const loadPublished = unstable_cache(
  async (slug: string): Promise<LegalRow[]> =>
    prisma.legalPage.findMany({
      where: { slug, status: "PUBLISHED" },
      orderBy: { version: "desc" },
      select: { locale: true, version: true, title: true, body: true, status: true, publishedAt: true },
    }),
  ["legal-published"],
  { tags: [LEGAL_TAG] },
);

/** Texte à afficher (version demandée ou en vigueur, repli sur le français), avec la liste des versions. */
export async function getLegalDocument(slug: LegalSlug, locale: string, version?: number | null) {
  // Le cache sérialise en JSON : les dates reviennent en chaînes
  const rows = (await loadPublished(slug)).map((r) => ({ ...r, publishedAt: r.publishedAt ? new Date(r.publishedAt) : null }));
  return { doc: pickLegalDocument(rows, locale, version), versions: [...new Set(rows.map((r) => r.version))] };
}

/**
 * Version des CGU à enregistrer quand un joueur les accepte : la version publiée en vigueur, jamais
 * moins que la version exigée (une publication mineure ne force pas la réacceptation).
 */
export async function currentTermsVersion(required: number): Promise<number> {
  const latest = await prisma.legalPage.findFirst({
    where: { slug: "cgu", status: "PUBLISHED" },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  return Math.max(required, latest?.version ?? 0);
}
