import type { Metadata } from "next";
import { legalMetadata, LegalPageView, requestedVersion } from "@/components/legal/LegalPageView";

export async function generateMetadata({ params, searchParams }: PageProps<"/[locale]/cgu">): Promise<Metadata> {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  return legalMetadata("cgu", locale, requestedVersion(query.v));
}

export default async function CguPage({ params, searchParams }: PageProps<"/[locale]/cgu">) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  return <LegalPageView slug="cgu" locale={locale} version={requestedVersion(query.v)} />;
}
