import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { GuestBootstrap } from "@/components/GuestBootstrap";
import { PageShell } from "@/components/PageShell";
import { SectionTitle } from "@/components/SectionTitle";
import { NotificationList } from "@/components/social/NotificationList";
import { getSetting } from "@/server/settings";
import { listNotifications, purgeOldNotifications } from "@/server/social/queries";
import { getCurrentUser } from "@/server/user";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Toutes les notifications du joueur, les plus récentes d'abord. */
export default async function NotificationsPage() {
  const [t, user] = await Promise.all([getTranslations("notifications"), getCurrentUser()]);
  if (!user) {
    return (
      <PageShell>
        <GuestBootstrap />
      </PageShell>
    );
  }

  // Purge paresseuse des notifications lues trop anciennes, sans tâche planifiée
  await purgeOldNotifications(user.id, await getSetting("notifications.retentionDays"));
  const { items, nextCursor } = await listNotifications(user.id, null);

  return (
    <PageShell>
      <SectionTitle level={1} kanji="報" title={t("title")} />
      <NotificationList initial={items} initialCursor={nextCursor} />
    </PageShell>
  );
}
