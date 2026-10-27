
import { getRarities } from "@/server/catalog/rarities";
import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { ArcadeBanner } from "@/components/ArcadeBanner";
import { AmbassadorPackCard } from "@/components/ambassador/AmbassadorPackCard";
import { BoosterShowcase } from "@/components/boosters/showcase/BoosterShowcase";
import type { ShowcaseFamily, ShowcaseItem } from "@/components/boosters/showcase/types";
import { RecentPulls } from "@/components/home/RecentPulls";
import { ReviewsSection, type ReviewViewer } from "@/components/home/ReviewsSection";
import { TopCollectors } from "@/components/home/TopCollectors";
import { PageShell } from "@/components/PageShell";
import { SectionTitle } from "@/components/SectionTitle";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { routing } from "@/i18n/routing";
import { JsonLd } from "@/components/seo/JsonLd";
import { localeAlternates, localePath } from "@/lib/seo/alternates";
import { homeGraph } from "@/lib/seo/structured-data";
import { appUrl } from "@/server/env";
import { poolCounts } from "@/lib/boosters/draw";
import { boosterPanelData, wishlistInPool, type WishlistInPool } from "@/lib/boosters/panel";
import { isRotatingFamily } from "@/lib/boosters/rotation";
import { initialSelection } from "@/lib/boosters/showcase";
import { BOOSTER_FAMILIES, FAMILY_KANJI, localize } from "@/lib/boosters/types";
import { type Rarity } from "@/lib/catalog/rarity";
import { canReview, pinnedFirst } from "@/lib/social/reviews";
import { readBannerPity } from "@/server/boosters/open-core";
import {
  getBoosterOffers,
  getBoosterPool,
  getBoosterRotation,
  getBoosterTypeEntry,
  getBoosterTypes,
  getFilterContext,
} from "@/server/boosters/pools";
import { getBoosterRules } from "@/server/boosters/rules";
import { boosterStateFrom } from "@/server/boosters/state";
import { getTopCollectors } from "@/server/collection/leaderboard";
import { getWishlistCardIds } from "@/server/collection/profile-cards";
import { getRecentPulls } from "@/server/home/pulls";
import { ownedCardIds } from "@/server/collection/owned";
import { getBoosterCredits, getSealedDrops } from "@/server/economy/queries";
import { getSealedDisplays } from "@/server/boosters/sealed";
import { SealedDropsRow } from "@/components/boosters/SealedDropsRow";
import { getOwnReview, getReviewSample, getReviewSummary } from "@/server/social/reviews";
import { getCurrentUser } from "@/server/user";
import { getAmbassadorPack } from "@/server/ambassador/queries";
import { getSetting } from "@/server/settings";

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = hasLocale(routing.locales, raw) ? raw : routing.defaultLocale;
  const [t, rules, offers] = await Promise.all([
    getTranslations({ locale, namespace: "boosters" }),
    getBoosterRules(),
    getBoosterOffers(),
  ]);
  return {
    title: { absolute: t("metaTitle") },
    description: t("metaDescription", {
      minutes: rules.intervalMinutes,
      count: offers.filter((o) => o.availability !== "hidden").length,
    }),
    alternates: localeAlternates("/", locale),
  };
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Accueil : vitrine des boosters (planche « B · Intégrée à l’app »), puis gros tirages, avis et podium. */
export default async function BoostersPage({ searchParams }: PageProps<"/[locale]">) {
  const RARITIES = await getRarities();
  const [t, format, user, rules, offers, rotation, ctx, query, locale] = await Promise.all([
    getTranslations("boosters"),
    getFormatter(),
    getCurrentUser(),
    getBoosterRules(),
    getBoosterOffers(),
    getBoosterRotation(),
    getFilterContext(),
    searchParams,
    getLocale(),
  ]);

  // Le catalogue est public. Créer l'invité au moment de jouer évite de remplacer tout l'écran
  // après hydratation (LCP/CLS) et de créer un compte pour chaque simple consultation.
  const state = boosterStateFrom(user ?? {
    boosterStock: rules.stock.max, boosterAnchor: new Date(), coins: await getSetting("economy.startingZeni"), pityCount: 0, standardCount: 0, ambassadorSince: null,
  }, rules);
  const visible = offers.filter((o) => o.availability !== "hidden");
  // Hors rotation : affichés grisés dans la vitrine, jamais sélectionnables
  const shown = offers.filter((o) => o.availability !== "hidden" || o.rotation === "resting");
  const families = BOOSTER_FAMILIES.filter((f) => shown.some((o) => o.type.family === f));

  // Boosters crédités (cadeaux d'amis, boutique, récompenses), par type, à ouvrir en premier ;
  // en bas de page, avis des joueurs et podium des collectionneurs
  const member = user !== null && canReview(user);
  const [credits, allTypes, reviews, reviewSummary, ownReview, collectors, pulls, pullRefresh] = await Promise.all([
    user ? getBoosterCredits(user.id) : new Map<string, number>(),
    getBoosterTypes(),
    getReviewSample(),
    getReviewSummary(),
    member && user ? getOwnReview(user.id) : null,
    getTopCollectors(3),
    getRecentPulls(locale),
    getSetting("home.pullFeed.refreshSeconds"),
  ]);
  const pullsOwned = pulls ? await ownedCardIds(user?.id, pulls.map((p) => p.card.cardId)) : [];
  const reviewViewer: ReviewViewer = member
    ? { kind: "member", own: ownReview }
    : !user || (user.isGuest && !user.bannedAt)
      ? { kind: "guest" }
      : { kind: "none" };
  // Sachets scellés (Divin, Apocalyptique) gardés pour plus tard
  const [sealedDrops, sealedDisplays, apocalypseKarma, ambassadorPack] = await Promise.all([
    user ? getSealedDrops(user.id) : [],
    getSealedDisplays(locale),
    getSetting("booster.apocalypseKarma"),
    // Pack hebdomadaire des ambassadeurs, au-dessus des boosters à ouvrir
    user && !user.bannedAt ? getAmbassadorPack(user, locale) : null,
  ]);
  const credited = allTypes
    .filter((e) => (credits.get(e.type.id) ?? 0) > 0 && e.type.filter !== null)
    .map((e) => ({ slug: e.type.slug, name: localize(e.type.name, locale), count: credits.get(e.type.id)! }));

  const bannerPity = readBannerPity(user?.bannerPity ?? {});
  const userCounters = { stock: state.stock, pityCount: user?.pityCount ?? 0, standardCount: user?.standardCount ?? 0 };
  const cardsOf = (o: (typeof visible)[number]) => (o.type.slotFloors.length > 0 ? o.type.slotFloors.length : rules.draw.slotFloors.length);

  // Tous les boosters sont envoyés d'un coup : la vitrine change de booster sans rechargement.
  // Les pools sont en cache (lecture en mémoire) ; on ne les lit que pour les souhaits et les vedettes.
  const wished = user ? await getWishlistCardIds(user.id) : [];
  const items: ShowcaseItem[] = await Promise.all(
    shown.map(async (offer): Promise<ShowcaseItem> => {
      const selectable = offer.availability !== "hidden";
      if (!selectable) return { type: offer.type, cards: cardsOf(offer), selectable, panel: null, wishlist: null };
      let featuredCounts: Record<Rarity, number> | undefined;
      let wishlist: WishlistInPool | null = null;
      if (offer.type.featuredCardIds.length > 0 || wished.length > 0) {
        const entry = await getBoosterTypeEntry(offer.type.slug);
        const pool = entry ? await getBoosterPool(entry) : null;
        if (pool && wished.length > 0) wishlist = wishlistInPool(pool, wished);
        if (pool && offer.type.featuredCardIds.length > 0) {
          const wanted = new Set(offer.type.featuredCardIds);
          featuredCounts = poolCounts(
            Object.fromEntries(RARITIES.map((r) => [r, pool[r].filter((id) => wanted.has(id))])) as Record<Rarity, string[]>,
          );
        }
      }
      const panel = boosterPanelData({
        type: offer.type,
        counts: offer.counts,
        rules: rules.draw,
        availability: offer.availability,
        user: { ...userCounters, bannerPity: bannerPity[offer.type.id] ?? 0 },
        featuredCounts,
      });
      return { type: offer.type, cards: cardsOf(offer), selectable, panel, wishlist };
    }),
  );

  const initial = initialSelection(
    items.map((i) => ({ slug: i.type.slug, family: i.type.family, name: "", tagline: "", selectable: i.selectable })),
    { slug: first(query.b), family: first(query.f) },
  );
  const showcaseFamilies: ShowcaseFamily[] = families.map((family) => ({
    family,
    kanji: FAMILY_KANJI[family],
    title: t(`families.${family}.title`),
    short: t(`families.${family}.short`),
    subtitle: t(`families.${family}.subtitle`),
    rotating: isRotatingFamily(family),
  }));

  // Pastille de la bannière vedette ouverte (la plus proche de sa fin)
  const banner = visible
    .filter((o) => o.type.kind === "BANNER" && o.type.featuredCardIds.length > 0)
    .sort((a, b) => (a.type.endsAt?.getTime() ?? Infinity) - (b.type.endsAt?.getTime() ?? Infinity))[0];

  const tMeta = await getTranslations("metadata");
  const structuredData = homeGraph(appUrl(), localePath("/", hasLocale(routing.locales, locale) ? locale : routing.defaultLocale), { name: tMeta("title"), description: tMeta("description"), language: locale });

  return (
    <PageShell>
      <JsonLd data={structuredData} />
      <ArcadeBanner />

      {ambassadorPack && <AmbassadorPackCard {...ambassadorPack} />}

      {credited.length > 0 && (
        <ul className="flex flex-col gap-2">
          {credited.map((c) => (
            <li
              key={c.slug}
              className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-kin bg-surface p-4"
            >
              <p className="flex items-center gap-2 font-bold">
                <span aria-hidden="true" lang="ja" className="font-seal text-xl text-kin">
                  贈
                </span>
                {t("creditBoosters", { count: c.count, name: c.name })}
              </p>
              <ButtonLink href={`/ouvrir/${c.slug}?credit=1`} variant="primary">
                {t("openCredit")}
              </ButtonLink>
            </li>
          ))}
        </ul>
      )}

      {sealedDrops.length > 0 && (
        <SealedDropsRow drops={sealedDrops} displays={sealedDisplays} karma={{ current: user?.apocalypseKarma ?? 0, threshold: apocalypseKarma }} />
      )}

      {initial && (
        <BoosterShowcase
          items={items}
          families={showcaseFamilies}
          initial={initial}
          state={state}
          ctx={ctx}
          rotationNote={t("rotationNext", { when: format.relativeTime(rotation.window.endsAt, state.serverNow) })}
          banner={
            banner
              ? {
                  slug: banner.type.slug,
                  name: localize(banner.type.name, locale),
                  days: banner.type.endsAt ? Math.max(1, Math.ceil((banner.type.endsAt.getTime() - state.serverNow) / 86_400_000)) : null,
                }
              : null
          }
          heading={
            <SectionTitle
              level={1}
              kanji="開封"
              title={t("title")}
              subtitle={t("intro", {
                count: visible.length,
                families: families.length,
                minutes: rules.intervalMinutes,
                max: state.max,
              })}
            />
          }
        />
      )}

      {pulls && <RecentPulls initial={pulls} initialOwned={pullsOwned} refreshSeconds={pullRefresh} serverNow={state.serverNow} />}
      <ReviewsSection reviews={pinnedFirst(reviews)} summary={reviewSummary} viewer={reviewViewer} />
      <TopCollectors collectors={collectors} />
    </PageShell>
  );
}
