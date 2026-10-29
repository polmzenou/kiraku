import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { IncensePanel } from "@/components/boosters/IncensePanel";
import { PageShell } from "@/components/PageShell";
import { displayName, ProfileHeader } from "@/components/profile/ProfileHeader";
import { ProfileCustomizeButton } from "@/components/profile/ProfileCustomizeSheet";
import { ShareProfileButton } from "@/components/profile/ShareProfileButton";
import { Showcase } from "@/components/profile/Showcase";
import { ProfileSalesSection, WishlistSection } from "@/components/profile/ProfileCardSections";
import { SectionTitle } from "@/components/SectionTitle";
import { RelationActions } from "@/components/social/RelationActions";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { getPathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { completion } from "@/lib/collection/view";
import { effectiveLayout, layoutsAvailable } from "@/lib/collection/showcase-layouts";
import { USERNAME_REGEX } from "@/lib/username";
import { anonymousAccess, findProfileOwner } from "@/server/collection/profile";
import { loadProfile } from "@/server/collection/profile-page";
import { getCollectionSummary, getShowcase } from "@/server/collection/queries";
import { getProfileSales, getWishlist } from "@/server/collection/profile-cards";
import { ownedCardIds } from "@/server/collection/owned";
import { getSetting } from "@/server/settings";
import { prisma } from "@/server/db";
import { getPlayerDecor } from "@/server/profile/decor";
import { getCosmeticProgress, getEarnedBadges, getProfileDecor } from "@/server/profile/progress";
import type { Badge } from "@/lib/profile/conditions";
import { giftsSentToday } from "@/server/social/queries";
import { getSealedDrops } from "@/server/economy/queries";
import { getIncenseState } from "@/server/boosters/incense";
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
  const social = await socialBar({ owner, viewer, access, name });

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

  const [size, values, decor] = await Promise.all([
    getSetting("showcase.slots"),
    getSetting("collection.recycleValues"),
    getProfileDecor(owner.id, locale),
  ]);
  // Son propre profil (compte inscrit) : de quoi le personnaliser
  const customize = access.isOwner && viewer && !viewer.isGuest ? await customizeData(owner.id, locale) : null;
  const [showcase, summary, wishlist, sales, incense] = await Promise.all([
    getShowcase(owner.id, size, locale), getCollectionSummary(owner.id, values),
    getWishlist(owner.id, locale), getProfileSales(owner.id, locale),
    // Encens : seulement sur son propre profil
    access.isOwner && viewer && !viewer.bannedAt ? getIncenseState(owner.id) : null,
  ]);
  // Profil d'un autre joueur : ses cartes que le visiteur a déjà (pastille « Acquise »)
  const owned = access.isOwner
    ? []
    : await ownedCardIds(viewer?.id, [
        ...showcase.flatMap((s) => (s ? [s.cardId] : [])),
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
      <ProfileHeader
        username={owner.username}
        image={owner.image}
        isGuest={owner.isGuest}
        createdAt={owner.createdAt}
        decor={decor}
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

      {incense && <IncensePanel state={incense} />}

      <section className="flex flex-col gap-4">
        <SectionTitle kanji="飾" title={t("showcase")} />
        <Showcase
          initial={showcase}
          editable={access.isOwner}
          linkBase={access.isOwner ? "/collection" : "/wiki"}
          owned={owned}
          layout={effectiveLayout(owner.showcaseLayout, size)}
          layoutsEnabled={layoutsAvailable(size)}
        />
      </section>
      <WishlistSection cards={wishlist} editable={access.isOwner} owned={owned} />
      <ProfileSalesSection cards={sales} owned={owned} />
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
    const [price, perDaySent, perDayReceived, minAccountAgeHours, minFriendshipHours, timeZone, allowedRarities, sealedMinAccountDays, sealedPerWeek] = await Promise.all([
      getSetting("gifts.boosterPriceZeni"),
      getSetting("gifts.perDaySent"),
      getSetting("gifts.perDayReceived"),
      getSetting("gifts.minAccountAgeHours"),
      getSetting("gifts.minFriendshipHours"),
      getSetting("game.timeZone"),
      getSetting("gifts.allowedRarities"),
      getSetting("gifts.sealedMinAccountDays"),
      getSetting("gifts.sealedPerWeek"),
    ]);
    const [sent, sealed] = await Promise.all([giftsSentToday(viewer.id, timeZone), getSealedDrops(viewer.id)]);
    gift = {
      price,
      coins: viewer.coins,
      remaining: Math.max(0, perDaySent - sent),
      limits: { perDaySent, perDayReceived, minAccountAgeHours, minFriendshipHours, sealedMinAccountDays, sealedPerWeek },
      allowedRarities,
      sealed: sealed.filter((s) => s.giftable).map((s) => ({ id: s.id, kind: s.kind })),
    };
  }
  // Entre amis toujours ; hors amis si le réglage l'ouvre et que la collection est visible (même règle qu'à l'envoi)
  const canTrade =
    access.relation === "FRIENDS" ||
    (access.relation !== "BLOCKED_BY_ME" && access.collection && (await getSetting("trades.nonFriends")));
  const trade =
    canTrade && (await getSetting("trades.enabled"))
      ? { maxOffered: await getSetting("trades.maxOffered"), allowedRarities: await getSetting("trades.allowedRarities") }
      : null;
  return <RelationActions username={owner.username} name={name} initial={access.relation} gift={gift} trade={trade} />;
}

/** Choix actuels, titres, cadres et couleurs avec leur progression, % découvert, badges obtenus. */
async function customizeData(userId: string, locale: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, bio: true, titleAgreement: true, titleId: true, frameId: true, nameColorId: true, badgeOrder: true, createdAt: true, discordLinkedAt: true, ambassadorSince: true },
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
