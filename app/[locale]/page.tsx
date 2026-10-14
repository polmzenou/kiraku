import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { BoosterPanel } from "@/components/boosters/BoosterPanel";
import { NextFreeIn } from "@/components/boosters/NextFreeIn";
import { OpenLink } from "@/components/boosters/OpenLink";
import { Sachet } from "@/components/boosters/Sachet";
import { GuestBootstrap } from "@/components/GuestBootstrap";
import { PageShell } from "@/components/PageShell";
import { SectionTitle } from "@/components/SectionTitle";
import { getPathname, Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { BOOSTER_FAMILIES, BOOSTERS, contentsLabel, FAMILY_KANJI } from "@/lib/boosters/catalog";
import { atLeastOdds } from "@/lib/boosters/odds";
import { getStandardPool, poolSize } from "@/server/boosters/pool";
import { getBoosterRules } from "@/server/boosters/rules";
import { boosterStateFrom } from "@/server/boosters/state";
import { getCurrentUser } from "@/server/user";

export async function generateMetadata({ params }: PageProps<"/[locale]/boosters">): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = hasLocale(routing.locales, raw) ? raw : routing.defaultLocale;
  const [t, rules] = await Promise.all([getTranslations({ locale, namespace: "boosters" }), getBoosterRules()]);
  return {
    title: t("title"),
    description: t("metaDescription", { minutes: rules.intervalMinutes }),
    alternates: {
      canonical: getPathname({ href: "/boosters", locale }),
      languages: Object.fromEntries(routing.locales.map((l) => [l, getPathname({ href: "/boosters", locale: l })])),
    },
  };
}

export default async function BoostersPage() {
  const [t, user, rules] = await Promise.all([getTranslations("boosters"), getCurrentUser(), getBoosterRules()]);

  if (!user) {
    return (
      <PageShell>
        <GuestBootstrap />
      </PageShell>
    );
  }

  const state = boosterStateFrom(user, rules);
  const pool = await getStandardPool();
  const odds = atLeastOdds(rules.draw.rates, rules.draw.slotFloors);
  const contents = contentsLabel(rules.draw.slotFloors.length);
  const selected = BOOSTERS.standard;

  return (
    <PageShell bottomBar>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-8">
          <SectionTitle
            level={1}
            kanji="開封"
            title={t("title")}
            subtitle={t("intro", { minutes: rules.intervalMinutes, max: rules.stock.max })}
          />

          {BOOSTER_FAMILIES.map((family) => {
            const boosters = Object.values(BOOSTERS).filter((b) => b.family === family);
            return (
              <section key={family} className="flex flex-col gap-4">
                <SectionTitle
                  kanji={FAMILY_KANJI[family]}
                  title={t(`families.${family}.title`)}
                  subtitle={t(`families.${family}.subtitle`)}
                />
                <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6">
                  {boosters.map((b) => {
                    const name = t(`types.${b.slug}.name`);
                    const isSelected = b.slug === selected.slug;
                    return (
                      <li key={b.slug}>
                        <Link
                          href={`/ouvrir/${b.slug}`}
                          aria-label={t("openTile", { name })}
                          aria-current={isSelected ? "true" : undefined}
                          className={`flex flex-col items-center gap-2 rounded-lg border p-2 transition-transform active:scale-[0.98] ${
                            isSelected ? "border-shu bg-surface" : "border-transparent"
                          }`}
                        >
                          <Sachet theme={b.theme} name={name} tagline={t(`types.${b.slug}.tagline`)} contents={contents} />
                          <span className="flex items-center gap-1 text-xs font-bold text-shu">
                            <span aria-hidden="true" lang="ja" className="font-seal">
                              無料
                            </span>
                            · {t("free")}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>

        <aside className="lg:sticky lg:top-20">
          <BoosterPanel
            booster={selected}
            slotFloors={rules.draw.slotFloors}
            odds={odds}
            poolSize={poolSize(pool)}
            state={state}
          />
        </aside>
      </div>

      {/* Mobile : l'action principale reste à portée du pouce */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden">
        <OpenLink slug={selected.slug} stock={state.stock} />
        <NextFreeIn nextAt={state.nextAt} serverNow={state.serverNow} className="mt-1 text-center" />
      </div>
    </PageShell>
  );
}
