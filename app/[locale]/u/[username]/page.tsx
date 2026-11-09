import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { IncensePanel } from "@/components/boosters/IncensePanel";
import { PageShell } from "@/components/PageShell";
import { displayName, ProfileHeader } from "@/components/profile/ProfileHeader";
import { ProfileCustomizeButton } from "@/components/profile/ProfileCustomizeSheet";
import { ShareProfileButton } from "@/components/profile/ShareProfileButton";
import { CreateShowcaseButton } from "@/components/showcase/CreateShowcaseSheet";
import { ProfileShowcases } from "@/components/showcase/ProfileShowcases";
import { ShowcaseBanner } from "@/components/showcase/ShowcaseBanner";
import { ProfileSalesSection, WishlistSection } from "@/components/profile/ProfileCardSections";
import { profileSocialBar } from "@/components/profile/ProfileSocialBar";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { getPathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { completion } from "@/lib/collection/view";
import { effectiveTheme } from "@/lib/showcase/themes";
import { USERNAME_REGEX } from "@/lib/username";
import { anonymousAccess, findProfileOwner } from "@/server/collection/profile";
import { loadProfile } from "@/server/collection/profile-page";
import { getCollectionSummary } from "@/server/collection/queries";
import { getShowcaseCards, listShowcases } from "@/server/showcase/queries";
import { getProfileSales, getWishlist } from "@/server/collection/profile-cards";
import { ownedCardIds } from "@/server/collection/owned";
import { getSetting } from "@/server/settings";
import { prisma } from "@/server/db";
import { getPlayerDecor } from "@/server/profile/decor";
import { getCosmeticProgress, getEarnedBadges, getProfileDecor } from "@/server/profile/progress";
import type { Badge } from "@/lib/profile/conditions";
import { getIncenseState } from "@/server/boosters/incense";
import { isStaff, presenceOf } from "@/lib/social/presence";

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
  // Profils jamais indexés (le sitemap n'expose aucun joueur) ; liens suivis seulement s'il est public
  // pour tous, et jamais pour un invité
  const followable = !owner.isGuest && anonymousAccess(owner).profile;
  const href = `/u/${owner.username}`;
  return {
    title: t("metaTitle", { name }),
    description: t("metaDescription", { name }),
    robots: { index: false, follow: followable },
    alternates: { canonical: getPathname({ href, locale }) },
  };
}

export default async function ProfilePage({ params }: PageProps<"/[locale]/u/[username]">) {
  const { username } = await params;
  const locale = await getLocale();
  const { owner, viewer, access } = await loadProfile(username, locale);
  const [t, tAccount, format] = await Promise.all([getTranslations("profile"), getTranslations("account"), getFormatter()]);
  const name = displayName(owner.username, owner.isGuest, (code) => tAccount("guestName", { code }));
  const social = await profileSocialBar({ owner, viewer, access, name });
  // Présence : visible comme le profil lui-même (public, ou amis), jamais pour un invité
  const presence = access.profile && !owner.isGuest ? presenceOf(owner, new Date(), await getSetting("presence.onlineSeconds")) : undefined;

  if (!access.profile) {
    return (
      <PageShell>
        <ProfileHeader
          username={owner.username}
          image={owner.image}
          isGuest={owner.isGuest}
          decor={{ ...(await getPlayerDecor(owner.id)), bio: null, title: null, badges: [] }}
        />
        {social}
        <p className="lacquer rounded-card p-6 text-center text-text-muted">
          <span aria-hidden="true" className="mb-2 block font-seal text-3xl text-shu">秘</span>
          {t("private")}
        </p>
      </PageShell>
    );
  }

  const [values, decor, showcases, themesSetting, maxShowcases] = await Promise.all([
    getSetting("collection.recycleValues"),
    getProfileDecor(owner.id, locale),
    listShowcases(owner.id),
    getSetting("showcase.themes"),
    getSetting("showcase.maxPerPlayer"),
  ]);
  // Son propre profil (compte inscrit) : de quoi le personnaliser
  const customize = access.isOwner && viewer && !viewer.isGuest ? await customizeData(owner.id, locale) : null;
  const [featuredCards, summary, wishlist, sales, incense, tShowcase] = await Promise.all([
    showcases[0] ? getShowcaseCards(showcases[0].id, owner.id, showcases[0].layout, locale) : [],
    getCollectionSummary(owner.id, values),
    getWishlist(owner.id, locale), getProfileSales(owner.id, locale),
    // Encens : seulement sur son propre profil
    access.isOwner && viewer && !viewer.bannedAt ? getIncenseState(owner.id) : null,
    getTranslations("showcase"),
  ]);
  const shelf = showcases.map((s, i) => ({
    id: s.id,
    name: s.name ?? tShowcase("untitled", { n: i + 1 }),
    layout: s.layout,
    theme: effectiveTheme(s.theme, themesSetting),
    count: s.count,
  }));
  // Profil d'un autre joueur : ses cartes que le visiteur a déjà (pastille « Acquise »)
  const owned = access.isOwner
    ? []
    : await ownedCardIds(viewer?.id, [
        ...featuredCards.flatMap((s) => (s ? [s.cardId] : [])),
        ...wishlist.map((c) => c.cardId),
        ...sales.map((c) => c.cardId),
      ]);

  const stats = [
    [t("stats.unique"), format.number(summary.unique)],
    [t("stats.mythic"), format.number(summary.byRarity.MYTHIC.unique)],
    [t("stats.completion"), format.number(completion(summary), { style: "percent", maximumFractionDigits: 1 })],
  ] as const;

  return (
    <PageShell>
      {/* Haut du profil : le décor de la vitrine principale l'habille en bannière (dessous, bloc isolé) */}
      <div className="relative isolate flex flex-col gap-6">
        <ShowcaseBanner theme={shelf[0]?.theme ?? "none"} />
        <ProfileHeader
          username={owner.username}
          image={owner.image}
          isGuest={owner.isGuest}
          createdAt={owner.createdAt}
          decor={decor}
          presence={presence}
          action={
            customize && (
              <ProfileCustomizeButton
                username={owner.username}
                image={owner.image}
                initial={customize.initial}
                options={customize.options}
                badges={customize.badges}
                discoveredPercent={customize.discoveredPercent}
                privacy={{ visibility: owner.profileVisibility, showCollection: owner.showCollection }}
                appearOffline={viewer && isStaff(viewer.role) ? viewer.appearOffline : null}
              />
            )
          }
        />
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
      </div>

      {incense && <IncensePanel state={incense} />}

      <ProfileShowcases
        username={owner.username}
        isOwner={access.isOwner}
        // Les vitrines privées ne quittent jamais le serveur pour un visiteur : la principale seulement
        showcases={access.isOwner ? shelf : shelf.slice(0, 1)}
        mainCards={featuredCards}
        owned={owned}
        linkBase={access.isOwner ? "/collection" : "/wiki"}
        create={access.isOwner ? <CreateShowcaseButton username={owner.username} count={showcases.length} max={maxShowcases} /> : undefined}
      />
      <WishlistSection cards={wishlist} editable={access.isOwner} owned={owned} />
      <ProfileSalesSection cards={sales} owned={owned} />
    </PageShell>
  );
}

/** Choix actuels, titres, cadres et couleurs avec leur progression, % découvert, badges obtenus. */
async function customizeData(userId: string, locale: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, bio: true, titleAgreement: true, titleId: true, frameId: true, nameColorId: true, badgeOrder: true, createdAt: true, discordLinkedAt: true, ambassadorSince: true, role: true },
  });
  const [{ options, stats }, badges] = await Promise.all([getCosmeticProgress(userId, locale), getEarnedBadges(user)]);
  return {
    options,
    badges,
    discoveredPercent: stats.discoveredPercent,
    initial: {
      bio: user.bio ?? "",
      titleAgreement: user.titleAgreement,
      titleId: user.titleId,
      frameId: user.frameId,
      nameColorId: user.nameColorId,
      badgeOrder: user.badgeOrder.filter((b): b is Badge => (badges as string[]).includes(b)),
    },
  };
}
