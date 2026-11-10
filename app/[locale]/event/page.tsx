import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { ShowcaseEventView, type EventViewer } from "@/components/event/ShowcaseEventView";
import { isFrozen } from "@/lib/account/deletion";
import { getShowcaseEventState } from "@/server/event/showcase-queries";
import { getCurrentUser } from "@/server/user";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("event");
  return { title: t("title"), robots: { index: false, follow: false } };
}

/**
 * Event en cours. La page change d'un event à l'autre : aujourd'hui l'event vitrines (concours avec votes).
 * Caché tant que l'admin ne l'allume pas (404), sauf pour l'admin qui en voit l'aperçu.
 */
export default async function EventPage({ searchParams }: PageProps<"/[locale]/event">) {
  const [state, user, locale, t, { page }] = await Promise.all([
    getShowcaseEventState(),
    getCurrentUser(),
    getLocale(),
    getTranslations("event"),
    searchParams,
  ]);
  const active = user !== null && !user.bannedAt && !isFrozen(user);
  const admin = active && user.role === "ADMIN";
  if (!state.enabled && !admin) notFound();
  const viewer: EventViewer = user ? { id: user.id, username: user.username, isGuest: user.isGuest, canPlay: active && !user.isGuest } : null;
  const requested = Number(Array.isArray(page) ? page[0] : page);

  return (
    <PageShell>
      {!state.enabled && (
        <p role="status" className="rounded-control border border-kin/60 bg-kin/10 p-3 text-sm font-bold text-kin">
          {t("previewBanner")}
        </p>
      )}
      <ShowcaseEventView state={state} viewer={viewer} page={Number.isFinite(requested) ? requested : 1} locale={locale} />
    </PageShell>
  );
}
