import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { PageShell } from "@/components/PageShell";
import { displayName, ProfileHeader } from "@/components/profile/ProfileHeader";
import { ShareProfileButton } from "@/components/profile/ShareProfileButton";
import { Showcase } from "@/components/profile/Showcase";
import { ProfileSalesSection, WishlistSection } from "@/components/profile/ProfileCardSections";
import { SectionTitle } from "@/components/SectionTitle";
import { RelationActions } from "@/components/social/RelationActions";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { getPathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { completion } from "@/lib/collection/view";
import { USERNAME_REGEX } from "@/lib/username";
import { anonymousAccess, findProfileOwner } from "@/server/collection/profile";
import { loadProfile } from "@/server/collection/profile-page";
import { getCollectionSummary, getShowcase } from "@/server/collection/queries";
import { getProfileSales, getWishlist } from "@/server/collection/profile-cards";
import { getSetting } from "@/server/settings";
import { giftsSentToday } from "@/server/social/queries";
import type { ProfileAccess } from "@/lib/collection/visibility";
import type { Relation } from "@/lib/social/relation";

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
  const indexable = !owner.isGuest && anonymousAccess(owner).profile;
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
  const { owner, viewer, access } = await loadProfile(username, locale);
  const [t, tAccount, format] = await Promise.all([getTranslations("profile"), getTranslations("account"), getFormatter()]);
  const name = displayName(owner.username, owner.isGuest, (code) => tAccount("guestName", { code }));
  const social = await socialBar({ owner, viewer, access, name });

  if (!access.profile) {
    return (
      <PageShell>
        <ProfileHeader username={owner.username} image={owner.image} isGuest={owner.isGuest} />
        {social}
        <p className="lacquer rounded-card p-6 text-center text-text-muted">
          <span aria-hidden="true" className="mb-2 block font-seal text-3xl text-shu">秘</span>
          {t("private")}
        </p>
      </PageShell>
    );
  }

  const [size, values] = await Promise.all([getSetting("showcase.slots"), getSetting("collection.recycleValues")]);
  const [showcase, summary, wishlist, sales] = await Promise.all([
    getShowcase(owner.id, size, locale), getCollectionSummary(owner.id, values),
    getWishlist(owner.id, locale), getProfileSales(owner.id, locale),
  ]);

  const stats = [
    [t("stats.unique"), format.number(summary.unique)],
    [t("stats.mythic"), format.number(summary.byRarity.MYTHIC.unique)],
    [t("stats.completion"), format.number(completion(summary), { style: "percent", maximumFractionDigits: 1 })],
  ] as const;

  return (
    <PageShell>
      <ProfileHeader username={owner.username} image={owner.image} isGuest={owner.isGuest} createdAt={owner.createdAt} />
      {social}

      <div className="flex flex-wrap gap-2">
        <ShareProfileButton username={owner.username} title={t("metaTitle", { name })} />
        {access.collection && <ButtonLink href={`/u/${owner.username}/collection`}>{t("viewCollection")}</ButtonLink>}
        {access.isOwner && <ButtonLink href="/compte">{t("accountSettings")}</ButtonLink>}
        {access.isOwner && <ButtonLink href="/amis">{t("friends")}</ButtonLink>}
      </div>

      {access.isOwner && owner.profileVisibility !== "PUBLIC" && (
        <p className="lacquer rounded-card p-3 text-sm text-text-muted">
          {t(`ownerNotice.${owner.profileVisibility}`)}
        </p>
      )}

      <dl className="grid grid-cols-3 gap-2 md:gap-3">
        {stats.map(([label, value]) => (
          <div key={label} className="flex min-w-0 flex-col gap-0.5 lacquer rounded-card p-3">
            <dt className="truncate text-xs text-text-muted">{label}</dt>
            <dd className="text-lg font-bold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <section className="flex flex-col gap-4">
        <SectionTitle kanji="飾" title={t("showcase")} />
        <Showcase initial={showcase} editable={access.isOwner} linkBase={access.isOwner ? "/collection" : "/wiki"} />
      </section>
      <WishlistSection cards={wishlist} editable={access.isOwner} />
      <ProfileSalesSection cards={sales} />
    </PageShell>
  );
}

/**
 * Barre sociale du profil d'un autre joueur : relation et cadeaux pour un compte inscrit, invitation
 * à s'inscrire pour un invité, rien pour son propre profil ni pour le profil d'un invité.
 */
async function socialBar({
  owner,
  viewer,
  access,
  name,
}: {
  owner: { username: string; isGuest: boolean };
  viewer: Awaited<ReturnType<typeof loadProfile>>["viewer"];
  access: ProfileAccess & { relation: Relation | null };
  name: string;
}) {
  if (!viewer || access.isOwner || owner.isGuest || !access.relation) return null;
  if (!(await getSetting("social.enabled"))) return null;
  const t = await getTranslations("friends");
  if (viewer.isGuest) {
    return (
      <p className="flex flex-wrap items-center gap-2 text-sm text-text-muted">
        {t("guestOnlyShort", { name })}
        <ButtonLink href="/inscription">{t("signUp")}</ButtonLink>
      </p>
    );
  }
  if (viewer.bannedAt) return null;

  let gift = null;
  if (access.relation === "FRIENDS" && (await getSetting("gifts.enabled"))) {
    const [price, perDaySent, perDayReceived, minAccountAgeHours, minFriendshipHours, timeZone] = await Promise.all([
      getSetting("gifts.boosterPriceZeni"),
      getSetting("gifts.perDaySent"),
      getSetting("gifts.perDayReceived"),
      getSetting("gifts.minAccountAgeHours"),
      getSetting("gifts.minFriendshipHours"),
      getSetting("game.timeZone"),
    ]);
    const sent = await giftsSentToday(viewer.id, timeZone);
    gift = {
      price,
      coins: viewer.coins,
      remaining: Math.max(0, perDaySent - sent),
      limits: { perDaySent, perDayReceived, minAccountAgeHours, minFriendshipHours },
    };
  }
  return <RelationActions username={owner.username} name={name} initial={access.relation} gift={gift} />;
}
