import "server-only";
import { getFormatter, getTranslations } from "next-intl/server";
import type { routing } from "@/i18n/routing";
import type { WrappedSummary } from "@/lib/wrapped/summary";
import { appUrl } from "../env";
import type { StoryLabels } from "./story-image";

const ROMAN = ["", "I", "II", "III"] as const;

/** Textes de l'image story dans la langue `locale` : 4 chiffres clés, légendes et pied de page. */
export async function storyLabels(summary: WrappedSummary, locale: (typeof routing.locales)[number]): Promise<StoryLabels> {
  const [t, tTier, format] = await Promise.all([
    getTranslations({ locale, namespace: "wrapped.image" }),
    getTranslations({ locale, namespace: "ranked.tiers" }),
    getFormatter({ locale }),
  ]);
  const n = (v: number) => format.number(v, { notation: v >= 100_000 ? "compact" : "standard", maximumFractionDigits: 1 });
  const ranked = summary.ranked
    ? { label: t("ranked"), value: `${tTier(summary.ranked.tier)}${summary.ranked.division ? ` ${ROMAN[summary.ranked.division]}` : ""}` }
    : { label: t("battlesWon"), value: n(summary.battles.won) };
  return {
    kicker: t("kicker", { year: summary.year }),
    title: t("title", { name: summary.username }),
    stats: [
      { label: t("boosters"), value: n(summary.boosters.opened) },
      { label: t("zeni"), value: n(summary.zeni.earned) },
      ranked,
      { label: t("discoveries"), value: n(summary.discoveries) },
    ],
    bestPull: t("bestPull"),
    favorite: t("favorite"),
    footer: new URL(appUrl()).host,
  };
}
