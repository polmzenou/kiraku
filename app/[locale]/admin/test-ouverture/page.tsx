import { getLocale, getTranslations } from "next-intl/server";
import dynamic from "next/dynamic";
import type { OpeningType } from "@/components/opening/OpeningStage";
import { contentsLabel } from "@/lib/boosters/catalog";
import { effectiveSlotFloors, localize } from "@/lib/boosters/types";
import { requireAdmin } from "@/server/admin";
import { openingTestPool, testBoosterState } from "@/server/admin/opening-test";
import { getBoosterOffers } from "@/server/boosters/pools";
import { getBoosterRules } from "@/server/boosters/rules";

// La scène d'ouverture (Motion complet, gestes, sons) n'est chargée que sur cette page
const OpeningTestBench = dynamic(() => import("@/components/admin/OpeningTestBench").then((m) => m.OpeningTestBench));

/** Banc de test de l'ouverture : vrais boosters et vraies cartes, tirages factices jamais enregistrés. */
export default async function AdminOpeningTestPage() {
  await requireAdmin();
  const [t, locale, offers, rules] = await Promise.all([
    getTranslations("admin.openingTest"),
    getLocale(),
    getBoosterOffers(),
    getBoosterRules(),
  ]);
  const pool = await openingTestPool(locale);
  const types: OpeningType[] = offers.map(({ type }) => {
    const cards = effectiveSlotFloors(type.slotFloors, rules.draw.slotFloors).length;
    return {
      slug: type.slug,
      family: type.family,
      shape: type.shape,
      theme: type.theme,
      emblem: type.emblem,
      name: localize(type.name, locale),
      tagline: localize(type.tagline, locale),
      cards,
      contents: contentsLabel(cards),
      usesFreeStock: true,
      priceZeni: null,
      countsForPity: false,
      bonusEligible: false,
      featured: null,
    };
  });

  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-title text-2xl font-bold">{t("title")}</h2>
      <p className="text-sm text-text-muted">{t("intro")}</p>
      {types.length === 0 ? (
        <p className="text-sm text-text-muted">{t("noBooster")}</p>
      ) : (
        <OpeningTestBench types={types} pool={pool} initialState={testBoosterState()} />
      )}
    </section>
  );
}
