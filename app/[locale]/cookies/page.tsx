import type { Metadata } from "next";
import { legalMetadata, LegalPageView, requestedVersion } from "@/components/legal/LegalPageView";

export async function generateMetadata({ params, searchParams }: PageProps<"/[locale]/cookies">): Promise<Metadata> {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  return legalMetadata("cookies", locale, requestedVersion(query.v));
}

export default async function CookiesPage({ params, searchParams }: PageProps<"/[locale]/cookies">) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  return <LegalPageView slug="cookies" locale={locale} version={requestedVersion(query.v)} />;
}
