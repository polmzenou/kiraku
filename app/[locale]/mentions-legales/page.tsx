import type { Metadata } from "next";
import { legalMetadata, LegalPageView, requestedVersion } from "@/components/legal/LegalPageView";

export async function generateMetadata({ params, searchParams }: PageProps<"/[locale]/mentions-legales">): Promise<Metadata> {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  return legalMetadata("mentions-legales", locale, requestedVersion(query.v));
}

export default async function MentionsLegalesPage({ params, searchParams }: PageProps<"/[locale]/mentions-legales">) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  return <LegalPageView slug="mentions-legales" locale={locale} version={requestedVersion(query.v)} />;
}
