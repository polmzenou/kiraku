import type { Metadata } from "next";
import { hasLocale, useTranslations } from "next-intl";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { ArcadeBanner } from "@/components/ArcadeBanner";
import { BannerHero, type BannerSlide } from "@/components/boosters/BannerHero";
import { BoosterArt } from "@/components/boosters/BoosterArt";
import { BoosterPanel } from "@/components/boosters/BoosterPanel";
import { BoosterTile } from "@/components/boosters/BoosterTile";
import { usePercent } from "@/components/boosters/format";
import { NextFreeIn } from "@/components/boosters/NextFreeIn";
import { OpenLink } from "@/components/boosters/OpenLink";
import { RatesSheet } from "@/components/boosters/RatesSheet";
import { GuestBootstrap } from "@/components/GuestBootstrap";
import { ReviewsSection, type ReviewViewer } from "@/components/home/ReviewsSection";
import { TopCollectors } from "@/components/home/TopCollectors";
import { PageShell } from "@/components/PageShell";
import { SectionTitle } from "@/components/SectionTitle";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { getPathname, Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { poolCounts } from "@/lib/boosters/draw";
import { boosterPanelData } from "@/lib/boosters/panel";
import { isRotatingFamily } from "@/lib/boosters/rotation";
import { BOOSTER_FAMILIES, FAMILY_KANJI, localize, type BoosterFamily } from "@/lib/boosters/types";
import { RARITIES, RARITY_SEAL, type Rarity } from "@/lib/catalog/rarity";
import { canReview, pinnedFirst } from "@/lib/social/reviews";
import { readBannerPity } from "@/server/boosters/open-core";
import { cardViews } from "@/server/boosters/display";
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
import { getBoosterCredits } from "@/server/economy/queries";
import { getOwnReview, getReviewSample, getReviewSummary } from "@/server/social/reviews";
import { getCurrentUser } from "@/server/user";

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = hasLocale(routing.locales, raw) ? raw : routing.defaultLocale;
  const [t, rules, offers] = await Promise.all([
    getTranslations({ locale, namespace: "boosters" }),
    getBoosterRules(),
    getBoosterOffers(),
  ]);
  return {
    title: t("title"),
    description: t("metaDescription", {
      minutes: rules.intervalMinutes,
      count: offers.filter((o) => o.availability !== "hidden").length,
    }),
    alternates: {
      canonical: getPathname({ href: "/", locale }),
      languages: Object.fromEntries(routing.locales.map((l) => [l, getPathname({ href: "/", locale: l })])),
    },
  };
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Accueil : choix du booster (planche « Choix du booster »), onglets par famille sur mobile. */
export default async function BoostersPage({ searchParams }: PageProps<"/[locale]">) {
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

  if (!user) {
    return (
      <PageShell>
        <ArcadeBanner />
        <GuestBootstrap />
      </PageShell>
    );
  }

  const state = boosterStateFrom(user, rules);
  const visible = offers.filter((o) => o.availability !== "hidden");
  const families = BOOSTER_FAMILIES.filter((f) => visible.some((o) => o.type.family === f));
  const selected =
    visible.find((o) => o.type.slug === first(query.b)) ?? visible.find((o) => o.type.slug === "standard") ?? visible[0];
  const askedFamily = first(query.f);
  const activeFamily: BoosterFamily | undefined =
    families.find((f) => f === askedFamily) ?? selected?.type.family ?? families[0];

  // Boosters crédités (cadeaux d'amis, boutique, récompenses), par type, à ouvrir en premier ;
  // en bas de page, avis des joueurs et podium des collectionneurs
  const member = canReview(user);
  const [credits, allTypes, reviews, reviewSummary, ownReview, collectors] = await Promise.all([
    getBoosterCredits(user.id),
    getBoosterTypes(),
    getReviewSample(),
    getReviewSummary(),
    member ? getOwnReview(user.id) : null,
    getTopCollectors(3),
  ]);
  const reviewViewer: ReviewViewer = member
    ? { kind: "member", own: ownReview }
    : user.isGuest && !user.bannedAt
      ? { kind: "guest" }
      : { kind: "none" };
  const credited = allTypes
    .filter((e) => (credits.get(e.type.id) ?? 0) > 0 && e.type.filter !== null)
    .map((e) => ({ slug: e.type.slug, name: localize(e.type.name, locale), count: credits.get(e.type.id)! }));

  const bannerPity = readBannerPity(user.bannerPity);
  const userCounters = { stock: state.stock, pityCount: user.pityCount, standardCount: user.standardCount };

  // Bannières ouvertes : vedettes du pool et pitié vedette du joueur
  const banners = visible.filter((o) => o.type.kind === "BANNER" && o.type.featuredCardIds.length > 0);
  const bannerViews = await cardViews(banners.flatMap((b) => b.type.featuredCardIds), locale);
  const slides: BannerSlide[] = banners.map((b) => ({
    type: b.type,
    featured: b.type.featuredCardIds
      .flatMap((id) => bannerViews.get(id) ?? [])
      .sort((x, y) => RARITIES.indexOf(y.rarity) - RARITIES.indexOf(x.rarity)),
    pityLeft: b.type.featuredPity > 0 ? Math.max(1, b.type.featuredPity - (bannerPity[b.type.id] ?? 0)) : 0,
    now: state.serverNow,
  }));

  let panel = null;
  if (selected) {
    let featuredCounts: Record<Rarity, number> | undefined;
    if (selected.type.featuredCardIds.length > 0) {
      const entry = await getBoosterTypeEntry(selected.type.slug);
      const pool = entry ? await getBoosterPool(entry) : null;
      if (pool) {
        const wanted = new Set(selected.type.featuredCardIds);
        featuredCounts = poolCounts(
          Object.fromEntries(RARITIES.map((r) => [r, pool[r].filter((id) => wanted.has(id))])) as Record<Rarity, string[]>,
        );
      }
    }
    panel = boosterPanelData({
      type: selected.type,
      counts: selected.counts,
      rules: rules.draw,
      availability: selected.availability,
      user: { ...userCounters, bannerPity: bannerPity[selected.type.id] ?? 0 },
      featuredCounts,
    });
  }

  const cardsOf = (o: (typeof visible)[number]) => (o.type.slotFloors.length > 0 ? o.type.slotFloors.length : rules.draw.slotFloors.length);

  return (
    <PageShell bottomBar="tall">
      <ArcadeBanner />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          <SectionTitle
            level={1}
            kanji="開封"
            title={t("title")}
            subtitle={t("intro", {
              count: visible.length,
              families: families.length,
              minutes: rules.intervalMinutes,
              max: rules.stock.max,
            })}
          />

          {credited.length > 0 && (
            <ul className="flex flex-col gap-2">
              {credited.map((c) => (
                <li
                  key={c.slug}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-kin bg-surface p-4"
                >
                  <p className="flex items-center gap-2 font-bold">
                    <span aria-hidden="true" lang="ja" className="font-seal text-xl text-kin">
                      贈
                    </span>
                    {t("creditBoosters", { count: c.count, name: c.name })}
                  </p>
                  <ButtonLink href={`/ouvrir/${c.slug}?credit=1`} variant="shu">
                    {t("openCredit")}
                  </ButtonLink>
                </li>
              ))}
            </ul>
          )}

          <BannerHero slides={slides} />

          {/* Onglets de famille : filtrent la grille sur mobile, ancres sur desktop */}
          <nav
            aria-label={t("familiesLabel")}
            className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-20 -mx-4 border-b border-border bg-bg/95 backdrop-blur md:top-[calc(4rem+env(safe-area-inset-top))] lg:mx-0"
          >
            <ul className="flex gap-1 overflow-x-auto px-3 [scrollbar-width:none] lg:px-0">
              {families.map((family) => {
                const active = family === activeFamily;
                return (
                  <li key={family} className="shrink-0">
                    <Link
                      href={`/?b=${selected?.type.family === family ? selected.type.slug : visible.find((o) => o.type.family === family)!.type.slug}&f=${family}#famille-${family}`}
                      aria-current={active ? "true" : undefined}
                      className={`flex min-h-11 items-center gap-1.5 border-b-[3px] px-3 text-sm font-bold whitespace-nowrap ${
                        active ? "border-shu text-text" : "border-transparent text-text-muted hover:text-text"
                      }`}
                    >
                      <span aria-hidden="true" lang="ja" className="font-seal text-[15px] text-shu">
                        {FAMILY_KANJI[family]}
                      </span>
                      {t(`families.${family}.title`)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {families.map((family) => {
            const items = visible.filter((o) => o.type.family === family);
            return (
              <section
                key={family}
                id={`famille-${family}`}
                aria-labelledby={`famille-${family}-titre`}
                className={`scroll-mt-32 flex-col gap-4 ${family === activeFamily ? "flex" : "hidden lg:flex"}`}
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span aria-hidden="true" lang="ja" className="shrink-0 font-seal text-lg leading-none text-shu [writing-mode:vertical-rl]">
                    {FAMILY_KANJI[family]}
                  </span>
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <h2 id={`famille-${family}-titre`} className="font-title text-xl font-extrabold">
                        {t(`families.${family}.title`)}
                      </h2>
                      <p className="text-xs text-text-muted">{t(`families.${family}.subtitle`)}</p>
                    </div>
                    {isRotatingFamily(family) && (
                      <p className="text-xs text-text-muted">
                        {t("rotationNext", { when: format.relativeTime(rotation.window.endsAt, state.serverNow) })}
                      </p>
                    )}
                    <span aria-hidden="true" className="h-[3px] w-12 -skew-x-12 rounded-full bg-shu" />
                  </div>
                </div>
                <ul className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
                  {items.map((o) => (
                    <li key={o.type.slug}>
                      <BoosterTile type={o.type} cards={cardsOf(o)} selected={o.type.slug === selected?.type.slug} stock={state.stock} />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>

        {selected && panel && (
          <aside className="hidden lg:sticky lg:top-24 lg:block">
            <BoosterPanel type={selected.type} panel={panel} ctx={ctx} state={state} />
          </aside>
        )}
      </div>

      <ReviewsSection reviews={pinnedFirst(reviews)} summary={reviewSummary} viewer={reviewViewer} />
      <TopCollectors collectors={collectors} />

      {/* Mobile : le booster choisi et l'action principale restent à portée du pouce */}
      {selected && panel && (
        <div className="fixed inset-x-0 bottom-[var(--mobile-nav-height)] z-30 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-xl flex-col gap-2.5">
            <div className="flex items-center gap-3">
              <div className="w-8 shrink-0">
                <BoosterArt
                  shape={selected.type.shape}
                  theme={selected.type.theme}
                  emblem={selected.type.emblem}
                  name=""
                  contents=""
                  compact
                />
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-title text-base font-extrabold">{localize(selected.type.name, locale)}</span>
                <OddsSummary odds={panel.odds} />
              </div>
              <RatesSheet>
                <BoosterPanel type={selected.type} panel={panel} ctx={ctx} state={state} withOpen={false} headingId="selected-booster-sheet" />
              </RatesSheet>
            </div>
            <OpenLink
              slug={selected.type.slug}
              price={panel.price}
              availability={panel.availability}
              stock={state.stock}
              coins={state.coins}
            />
            {selected.type.usesFreeStock && panel.price.kind !== "free" && (
              <NextFreeIn nextAt={state.nextAt} serverNow={state.serverNow} className="text-center" />
            )}
          </div>
        </div>
      )}
    </PageShell>
  );
}

/** « 秀+ 18,4 % · 神 0,31 % » : la ligne de chances de la barre du bas. */
function OddsSummary({ odds }: { odds: Record<Rarity, number> }) {
  const percent = usePercent();
  const tRarity = useTranslations("rarity");
  const best: Rarity[] = odds.EPIC >= 0.999 ? (odds.LEGENDARY >= 0.999 ? ["MYTHIC"] : ["LEGENDARY", "MYTHIC"]) : ["EPIC", "MYTHIC"];
  return (
    <span className="truncate text-xs text-text-muted">
      {best.map((r, i) => (
        <span key={r}>
          {i > 0 && " · "}
          <span aria-hidden="true" lang="ja" className="font-seal">
            {RARITY_SEAL[r]}
          </span>
          <span className="sr-only">{tRarity(r)}</span>
          {r !== "MYTHIC" && "+"} {percent(odds[r])}
        </span>
      ))}
    </span>
  );
}
