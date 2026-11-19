import { getTranslations } from "next-intl/server";
import { hasYear, type WrappedSummary } from "@/lib/wrapped/summary";
import { cardViews } from "@/server/boosters/display";
import { appUrl } from "@/server/env";
import { ButtonLink } from "../ui/ButtonLink";
import { WrappedStory } from "./WrappedStory";

/**
 * Wrapped d'un joueur, prêt à afficher : fuda du plus gros tirage et de la carte préférée, ou message si
 * l'année est vide. Partagé par /wrapped (plein écran) et l'aperçu de /admin/wrapped (cadre de téléphone).
 */
export async function WrappedView({ summary, locale, imageSrc, embedded = false }: { summary: WrappedSummary; locale: string; imageSrc: string; embedded?: boolean }) {
  if (!hasYear(summary)) {
    const t = await getTranslations("wrapped.empty");
    return (
      <section className="flex flex-col items-center gap-4 lacquer rounded-card p-8 text-center">
        <h1 className="font-heading text-2xl">{t("title")}</h1>
        <p className="max-w-prose text-sm text-text-muted">{t("body", { year: summary.year })}</p>
        {!embedded && <ButtonLink href="/" variant="primary">{t("cta")}</ButtonLink>}
      </section>
    );
  }
  const ids = [summary.bestPull?.cardId, summary.favorite?.cardId].filter((id): id is string => Boolean(id));
  const views = await cardViews(ids, locale);
  return (
    <WrappedStory
      summary={summary}
      cards={{ bestPull: summary.bestPull ? (views.get(summary.bestPull.cardId) ?? null) : null, favorite: summary.favorite ? (views.get(summary.favorite.cardId) ?? null) : null }}
      imageSrc={imageSrc}
      siteUrl={appUrl()}
      embedded={embedded}
    />
  );
}
