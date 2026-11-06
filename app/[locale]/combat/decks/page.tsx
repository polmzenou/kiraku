import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { DeckManager } from "@/components/battle/DeckManager";
import { GuestBootstrap } from "@/components/GuestBootstrap";
import { PageShell } from "@/components/PageShell";
import { SectionTitle } from "@/components/SectionTitle";
import { Link, redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { abilityRules } from "@/lib/battle/config";
import { getBattleRules, getCandidates, getDecks, sweepBattlesFor } from "@/server/battle/queries";
import { getCurrentUser } from "@/server/user";

export async function generateMetadata({ params }: PageProps<"/[locale]/combat/decks">): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = hasLocale(routing.locales, raw) ? raw : routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: "battle.decks" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

/** Mes decks : équipes nommées, visibles du seul joueur. Mêmes garde-fous que /combat. */
export default async function DecksPage() {
  const [t, user] = await Promise.all([getTranslations("battle.decks"), getCurrentUser()]);
  if (!user) {
    return (
      <PageShell>
        <GuestBootstrap />
      </PageShell>
    );
  }

  const rules = await getBattleRules();
  if (user.isGuest || !rules.enabled) return redirect({ href: "/combat", locale: await getLocale() });

  // Cartes rendues par une partie expirée : disponibles avant l'affichage
  await sweepBattlesFor(user.id);
  const [decks, candidates] = await Promise.all([getDecks(user.id, rules), getCandidates(user.id, rules)]);

  return (
    <PageShell>
      <SectionTitle level={1} title={t("title")} subtitle={t("intro")} />
      <Link href="/combat" className="inline-flex min-h-11 items-center self-start text-sm font-bold text-shu underline-offset-4 hover:underline">
        {t("back")}
      </Link>
      <DeckManager
        decks={decks}
        candidates={candidates}
        abilities={abilityRules(rules)}
        maxDecks={rules.maxDecks}
        atelier={rules.abilityShopEnabled}
      />
    </PageShell>
  );
}
