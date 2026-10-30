
import { getRarities } from "@/server/catalog/rarities";
import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { AmbassadorPackCard } from "@/components/ambassador/AmbassadorPackCard";
import { BoosterShowcase } from "@/components/boosters/showcase/BoosterShowcase";
import type { ShowcaseFamily, ShowcaseItem } from "@/components/boosters/showcase/types";
import { NewsPanel } from "@/components/home/NewsPanel";
import { RecentPulls } from "@/components/home/RecentPulls";
import { ReviewsSection, type ReviewViewer } from "@/components/home/ReviewsSection";
import { TopCollectors } from "@/components/home/TopCollectors";
import { PageShell } from "@/components/PageShell";
import { SectionTitle } from "@/components/SectionTitle";
import { routing } from "@/i18n/routing";
import { JsonLd } from "@/components/seo/JsonLd";
import { localeAlternates, localePath } from "@/lib/seo/alternates";
import { baseOpenGraph, ogImageUrl } from "@/lib/seo/open-graph";
import { homeGraph } from "@/lib/seo/structured-data";
import { appUrl } from "@/server/env";
import { contentsLabel } from "@/lib/boosters/catalog";
import { poolCounts } from "@/lib/boosters/draw";
import { boosterPanelData, wishlistInPool, type WishlistInPool } from "@/lib/boosters/panel";
import { isRotatingFamily } from "@/lib/boosters/rotation";
import { currentFocus, initialSelection } from "@/lib/boosters/showcase";
import { BOOSTER_FAMILIES, FAMILY_KANJI, featuredIdsOf, localize, type BoosterTypeView } from "@/lib/boosters/types";
import { type Rarity } from "@/lib/catalog/rarity";
import { canReview, pinnedFirst } from "@/lib/social/reviews";
import { readBannerPity } from "@/server/boosters/open-core";
import {
  getBoosterOffers,
  getDisplayPool,
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
import { CreditStrip, type CreditedBooster } from "@/components/boosters/CreditStrip";
import { IncensePanel } from "@/components/boosters/IncensePanel";
import { getIncenseState } from "@/server/boosters/incense";
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
  const title = t("metaTitle");
  const description = t("metaDescription", {
    minutes: rules.intervalMinutes,
    count: offers.filter((o) => o.availability !== "hidden").length,
  });
  return {
    title: { absolute: title },
    description,
    alternates: localeAlternates("/", locale),
    // Titre et texte de l'aperçu (Discord, WhatsApp…) avec l'image de partage du site
    openGraph: { ...baseOpenGraph(locale), title, description },
    twitter: { card: "summary_large_image", title, description, images: [ogImageUrl(locale)] },
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
  // Tout ce qui ne dépend que du joueur part en une seule vague (avant : trois allers-retours de suite)
  const [
    credits, allTypes, reviews, reviewSummary, ownReview, collectors, [pulls, pullsOwned], pullRefresh,
    sealedDrops, sealedDisplays, apocalypseKarma, ambassadorPack, incense, wished,
  ] = await Promise.all([
    user ? getBoosterCredits(user.id) : new Map<string, number>(),
    getBoosterTypes(),
    getReviewSample(),
    getReviewSummary(),
    member && user ? getOwnReview(user.id) : null,
    getTopCollectors(3, { raw: user?.role === "DEV" }),
    // Tirages récents, puis ceux que le joueur possède déjà
    getRecentPulls(locale).then(async (rows) => [rows, rows ? await ownedCardIds(user?.id, rows.map((p) => p.card.cardId)) : []] as const),
    getSetting("home.pullFeed.refreshSeconds"),
    // Sachets scellés (Divin, Apocalyptique) gardés pour plus tard
    user ? getSealedDrops(user.id) : [],
    getSealedDisplays(locale),
    getSetting("booster.apocalypseKarma"),
    // Pack hebdomadaire des ambassadeurs, au-dessus des boosters à ouvrir
    user && !user.bannedAt ? getAmbassadorPack(user, locale) : null,
    user && !user.bannedAt ? getIncenseState(user.id) : null,
    user ? getWishlistCardIds(user.id) : [],
  ]);
  const reviewViewer: ReviewViewer = member
    ? { kind: "member", own: ownReview }
    : !user || (user.isGuest && !user.bannedAt)
      ? { kind: "guest" }
      : { kind: "none" };
  const cardsOf = (o: { type: BoosterTypeView }) => (o.type.slotFloors.length > 0 ? o.type.slotFloors.length : rules.draw.slotFloors.length);
  const credited: CreditedBooster[] = allTypes
    .filter((e) => (credits.get(e.type.id) ?? 0) > 0 && e.type.filter !== null)
    .map((e) => ({
      slug: e.type.slug,
      name: localize(e.type.name, locale),
      count: credits.get(e.type.id)!,
      shape: e.type.shape,
      theme: e.type.theme,
      emblem: e.type.emblem,
      contents: contentsLabel(cardsOf(e)),
    }));

  const bannerPity = readBannerPity(user?.bannerPity ?? {});
  const userCounters = { stock: state.stock, pityCount: user?.pityCount ?? 0, standardCount: user?.standardCount ?? 0 };

  // Tous les boosters sont envoyés d'un coup : la vitrine change de booster sans rechargement.
  // Les pools sont en cache (lecture en mémoire) ; on ne les lit que pour les souhaits et les vedettes.
  // Le client ne lit jamais focusCardIds (toutes les cartes d'une série, par booster) : il ne part pas
  const forClient = (type: BoosterTypeView): BoosterTypeView => (type.focusCardIds.length > 0 ? { ...type, focusCardIds: [] } : type);
  const items: ShowcaseItem[] = await Promise.all(
    shown.map(async (offer): Promise<ShowcaseItem> => {
      const selectable = offer.availability !== "hidden";
      if (!selectable) return { type: forClient(offer.type), cards: cardsOf(offer), selectable, panel: null, wishlist: null };
      let featuredCounts: Record<Rarity, number> | undefined;
      let wishlist: WishlistInPool | null = null;
      const featuredIds = featuredIdsOf(offer.type);
      if (featuredIds.length > 0 || wished.length > 0) {
        const entry = await getBoosterTypeEntry(offer.type.slug);
        const pool = entry ? await getDisplayPool(entry) : null;
        if (pool && wished.length > 0) wishlist = wishlistInPool(pool, wished);
        if (pool && featuredIds.length > 0) {
          const wanted = new Set(featuredIds);
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
      return { type: forClient(offer.type), cards: cardsOf(offer), selectable, panel, wishlist };
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

  // Focus série annoncé au-dessus de la vitrine : le premier activé parmi ceux qu'on peut ouvrir
  const focusOffer = currentFocus(visible);
  const focus =
    focusOffer && focusOffer.type.endsAt
      ? {
          slug: focusOffer.type.slug,
          count: visible.filter((o) => o.type.kind === "FOCUS" && o.availability === "open").length,
          endsAt: focusOffer.type.endsAt.getTime(),
          theme: focusOffer.type.theme,
          emblem: focusOffer.type.emblem,
        }
      : null;

  const tMeta = await getTranslations("metadata");
  const structuredData = homeGraph(appUrl(), localePath("/", hasLocale(routing.locales, locale) ? locale : routing.defaultLocale), { name: tMeta("title"), description: tMeta("description"), language: locale });

  return (
    <PageShell>
      <JsonLd data={structuredData} />
      <NewsPanel />

      {ambassadorPack && <AmbassadorPackCard {...ambassadorPack} />}

      <CreditStrip credits={credited} />

      {/* Encens : seulement quand il y a quelque chose à activer ou un boost en cours (toujours visible sur le profil) */}
      {incense && (incense.available > 0 || incense.activeUntil !== null) && <IncensePanel state={incense} />}

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
          focus={focus}
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
