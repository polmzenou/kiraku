import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { GuestBootstrap } from "@/components/GuestBootstrap";
import { PageShell } from "@/components/PageShell";
import { SectionTitle } from "@/components/SectionTitle";
import { ExpeditionScreen } from "@/components/expedition/ExpeditionScreen";
import { isFrozen } from "@/lib/account/deletion";
import { getExpeditionPage } from "@/server/expedition/queries";
import { hasPendingExpedition } from "@/server/expedition/status";
import { getSetting } from "@/server/settings";
import { getCurrentUser } from "@/server/user";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("expedition");
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

/**
 * Expéditions (étape 14). Cachées tant que l'admin ne les allume pas (404, rien dans la nav), sauf pour
 * l'admin qui en voit l'aperçu, et pour un joueur dont une expédition est encore en route ou à révéler.
 */
export default async function ExpeditionPage() {
  const [user, t, locale, enabled] = await Promise.all([getCurrentUser(), getTranslations("expedition"), getLocale(), getSetting("expedition.enabled")]);
  if (!user) {
    if (!enabled) notFound();
    return (
      <PageShell>
        <GuestBootstrap />
      </PageShell>
    );
  }
  if (user.bannedAt || isFrozen(user)) notFound();
  const admin = user.role === "ADMIN";
  if (!enabled && !admin && !(await hasPendingExpedition(user.id))) notFound();

  const view = await getExpeditionPage(user, locale);

  return (
    <PageShell>
      <SectionTitle level={1} kanji="遠征" title={t("title")} subtitle={t("subtitle")} />
      {view.preview && (
        <p role="status" className="rounded-control border border-kin/60 bg-kin/10 p-3 text-sm font-bold text-kin">
          {t("previewBanner")}
        </p>
      )}
      {!view.enabled && !view.preview && (
        <p role="status" className="rounded-control border border-border p-3 text-sm text-text-muted">
          {t("closedBanner")}
        </p>
      )}
      <ExpeditionScreen view={view} />
    </PageShell>
  );
}
