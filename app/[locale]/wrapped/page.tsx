import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { GuestBootstrap } from "@/components/GuestBootstrap";
import { PageShell } from "@/components/PageShell";
import { WrappedView } from "@/components/wrapped/WrappedView";
import { isFrozen } from "@/lib/account/deletion";
import { localePath } from "@/lib/seo/alternates";
import { getCurrentUser } from "@/server/user";
import { getWrapped, getWrappedPhase } from "@/server/wrapped/queries";

export async function generateMetadata(): Promise<Metadata> {
  const [t, { settings }] = await Promise.all([getTranslations("wrapped"), getWrappedPhase()]);
  return { title: t("metaTitle", { year: settings.year }), robots: { index: false, follow: false } };
}

/**
 * Wrapped de l'année : récap personnel en diaporama, ouvert pendant la période réglée dans /admin/wrapped.
 * Hors période ou coupé : 404, sauf pour l'admin (aperçu de son propre Wrapped).
 */
export default async function WrappedPage() {
  const [user, locale, { settings, phase }] = await Promise.all([getCurrentUser(), getLocale(), getWrappedPhase()]);
  const admin = user?.role === "ADMIN";
  if (phase !== "open" && !admin) notFound();
  if (!user) {
    return (
      <PageShell>
        <GuestBootstrap />
      </PageShell>
    );
  }
  if (user.bannedAt || isFrozen(user)) notFound();
  const summary = await getWrapped(user.id, settings.year);
  if (!summary) notFound();
  const current = locale === "en" ? "en" : "fr";
  return (
    <PageShell>
      <WrappedView summary={summary} locale={locale} imageSrc={localePath("/wrapped/image", current)} />
    </PageShell>
  );
}
