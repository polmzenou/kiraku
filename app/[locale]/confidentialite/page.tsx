import type { Metadata } from "next";
import { legalMetadata, LegalPageView, requestedVersion } from "@/components/legal/LegalPageView";

export async function generateMetadata({ params, searchParams }: PageProps<"/[locale]/confidentialite">): Promise<Metadata> {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  return legalMetadata("confidentialite", locale, requestedVersion(query.v));
}

export default async function ConfidentialitePage({ params, searchParams }: PageProps<"/[locale]/confidentialite">) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  return <LegalPageView slug="confidentialite" locale={locale} version={requestedVersion(query.v)} />;
}
