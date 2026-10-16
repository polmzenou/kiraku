import "server-only";
import { LEGAL_SLUGS, type LegalSlug } from "@/lib/legal/legal";
import { prisma } from "../db";

/** Vue d'ensemble de /admin/legal : version en vigueur, date, brouillon en cours, par page. */
export async function legalOverview() {
  const rows = await prisma.legalPage.findMany({
    select: { slug: true, locale: true, version: true, status: true, publishedAt: true },
    orderBy: { version: "desc" },
  });
  return LEGAL_SLUGS.map((slug) => {
    const own = rows.filter((r) => r.slug === slug);
    const published = own.find((r) => r.status === "PUBLISHED");
    const draft = own.find((r) => r.status === "DRAFT");
    return {
      slug,
      version: published?.version ?? null,
      publishedAt: published?.publishedAt ?? null,
      draftVersion: draft?.version ?? null,
    };
  });
}

/** Toutes les versions d'une page (toutes langues), de la plus récente à la plus ancienne. */
export async function legalVersions(slug: LegalSlug) {
  return prisma.legalPage.findMany({
    where: { slug },
    orderBy: [{ version: "desc" }, { locale: "asc" }],
    select: {
      version: true,
      locale: true,
      title: true,
      body: true,
      status: true,
      publishedAt: true,
      updatedAt: true,
      publishedBy: { select: { username: true } },
    },
  });
}
