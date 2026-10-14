import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { PageShell } from "@/components/PageShell";
import { displayName, ProfileHeader } from "@/components/profile/ProfileHeader";
import { ShareProfileButton } from "@/components/profile/ShareProfileButton";
import { Showcase } from "@/components/profile/Showcase";
import { SectionTitle } from "@/components/SectionTitle";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { getPathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { completion } from "@/lib/collection/view";
import { USERNAME_REGEX } from "@/lib/username";
import { accessFor, findProfileOwner } from "@/server/collection/profile";
import { loadProfile } from "@/server/collection/profile-page";
import { getCollectionSummary, getShowcase } from "@/server/collection/queries";
import { getSetting } from "@/server/settings";

export async function generateMetadata({ params }: PageProps<"/[locale]/u/[username]">): Promise<Metadata> {
  const { locale: raw, username: rawUsername } = await params;
  const locale = hasLocale(routing.locales, raw) ? raw : routing.defaultLocale;
  const username = decodeURIComponent(rawUsername);
  const owner = USERNAME_REGEX.test(username) ? await findProfileOwner(username) : null;
  if (!owner) return {};
  const [t, tAccount] = await Promise.all([
    getTranslations({ locale, namespace: "profile" }),
    getTranslations({ locale, namespace: "account" }),
  ]);
  const name = displayName(owner.username, owner.isGuest, (code) => tAccount("guestName", { code }));
  // Indexé seulement s'il est public pour tous, et jamais pour un invité
  const indexable = !owner.isGuest && accessFor(null, owner).profile;
  const href = `/u/${owner.username}`;
  return {
    title: t("metaTitle", { name }),
    description: t("metaDescription", { name }),
    robots: indexable ? undefined : { index: false, follow: false },
    alternates: { canonical: getPathname({ href, locale }) },
  };
}

export default async function ProfilePage({ params }: PageProps<"/[locale]/u/[username]">) {
  const { username } = await params;
  const locale = await getLocale();
  const { owner, access } = await loadProfile(username, locale);
  const [t, tAccount, format] = await Promise.all([getTranslations("profile"), getTranslations("account"), getFormatter()]);
  const name = displayName(owner.username, owner.isGuest, (code) => tAccount("guestName", { code }));

  if (!access.profile) {
    return (
      <PageShell>
        <ProfileHeader username={owner.username} image={owner.image} isGuest={owner.isGuest} />
        <p className="rounded-lg border border-border bg-surface p-6 text-center text-text-muted">
          <span aria-hidden="true" className="mb-2 block font-seal text-3xl text-shu">秘</span>
          {t("private")}
        </p>
      </PageShell>
    );
  }

  const [size, values] = await Promise.all([getSetting("showcase.slots"), getSetting("collection.recycleValues")]);
  const [showcase, summary] = await Promise.all([getShowcase(owner.id, size, locale), getCollectionSummary(owner.id, values)]);

  const stats = [
    [t("stats.unique"), format.number(summary.unique)],
    [t("stats.mythic"), format.number(summary.byRarity.MYTHIC.unique)],
    [t("stats.completion"), format.number(completion(summary), { style: "percent", maximumFractionDigits: 1 })],
  ] as const;

  return (
    <PageShell>
      <ProfileHeader username={owner.username} image={owner.image} isGuest={owner.isGuest} createdAt={owner.createdAt} />

      <div className="flex flex-wrap gap-2">
        <ShareProfileButton username={owner.username} title={t("metaTitle", { name })} />
        {access.collection && <ButtonLink href={`/u/${owner.username}/collection`}>{t("viewCollection")}</ButtonLink>}
        {access.isOwner && <ButtonLink href="/compte#confidentialite">{t("privacy")}</ButtonLink>}
      </div>

      {access.isOwner && owner.profileVisibility !== "PUBLIC" && (
        <p className="rounded-lg border border-border bg-surface p-3 text-sm text-text-muted">
          {t(`ownerNotice.${owner.profileVisibility}`)}
        </p>
      )}

      <dl className="grid grid-cols-3 gap-2 md:gap-3">
        {stats.map(([label, value]) => (
          <div key={label} className="flex min-w-0 flex-col gap-0.5 rounded-lg border border-border bg-surface p-3">
            <dt className="truncate text-xs text-text-muted">{label}</dt>
            <dd className="text-lg font-bold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <section className="flex flex-col gap-4">
        <SectionTitle kanji="飾" title={t("showcase")} />
        <Showcase initial={showcase} editable={access.isOwner} linkBase={access.isOwner ? "/collection" : "/wiki"} />
      </section>
    </PageShell>
  );
}
