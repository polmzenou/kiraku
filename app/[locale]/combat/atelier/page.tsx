import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { WorkshopBrowser } from "@/components/battle/WorkshopBrowser";
import { GuestBootstrap } from "@/components/GuestBootstrap";
import { ZeniCoin } from "@/components/layout/ZeniCoin";
import { PageShell } from "@/components/PageShell";
import { SectionTitle } from "@/components/SectionTitle";
import { Link, redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { getBattleRules, getWorkshopCards } from "@/server/battle/queries";
import { getCurrentUser } from "@/server/user";

export async function generateMetadata({ params }: PageProps<"/[locale]/combat/atelier">): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = hasLocale(routing.locales, raw) ? raw : routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: "battle.atelier" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

const CARD_ID = /^[A-Za-z0-9_-]{1,40}$/;

/** Atelier : passifs et technique de chaque carte, achetés en Zeni et rééquipés gratuitement. Mêmes garde-fous que /combat/decks. */
export default async function AtelierPage({ searchParams }: PageProps<"/[locale]/combat/atelier">) {
  const [t, user] = await Promise.all([getTranslations("battle.atelier"), getCurrentUser()]);
  if (!user) {
    return (
      <PageShell>
        <GuestBootstrap />
      </PageShell>
    );
  }

  const rules = await getBattleRules();
  if (user.isGuest || !rules.enabled) return redirect({ href: "/combat", locale: await getLocale() });

  const { carte } = await searchParams;
  const focus = typeof carte === "string" && CARD_ID.test(carte) ? carte : null;
  const cards = rules.abilityShopEnabled ? await getWorkshopCards(user.id, rules, focus) : [];

  return (
    <PageShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionTitle level={1} kanji="工房" title={t("title")} subtitle={t("intro")} />
        <p className="flex items-center gap-2 rounded-full border border-kin/50 bg-surface px-4 py-2">
          <span className="sr-only">{t("balance", { amount: user.coins })}</span>
          <ZeniCoin size={20} />
          <span aria-hidden="true" className="text-lg font-bold tabular-nums text-kin">
            {t("amount", { amount: user.coins })}
          </span>
        </p>
      </div>
      <Link href="/combat" className="inline-flex min-h-11 items-center self-start text-sm font-bold text-shu underline-offset-4 hover:underline">
        {t("back")}
      </Link>
      {rules.abilityShopEnabled ? (
        <WorkshopBrowser
          cards={cards}
          coins={user.coins}
          rules={{ keywordValues: rules.keywordValues, techniques: rules.techniques, synergyAtkPct: rules.synergyAtkPct, abilityPrices: rules.abilityPrices }}
          initialCardId={focus}
        />
      ) : (
        <p className="lacquer rounded-card p-4 text-center text-sm text-text-muted">{t("closed")}</p>
      )}
    </PageShell>
  );
}
