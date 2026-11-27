import { getLocale, getTranslations } from "next-intl/server";
import dynamic from "next/dynamic";
import type { OpeningType } from "@/components/opening/OpeningStage";
import { contentsLabel } from "@/lib/boosters/catalog";
import { effectiveSlotFloors, localize } from "@/lib/boosters/types";
import { requireAdminView } from "@/server/admin";
import { openingTestPool, testBoosterState } from "@/server/admin/opening-test";
import { getBoosterOffers } from "@/server/boosters/pools";
import { getBoosterRules } from "@/server/boosters/rules";
import { getSealedDisplays } from "@/server/boosters/sealed";
import { testBenchFrescoes } from "@/server/fresco/admin-queries";

// La scène d'ouverture (Motion complet, gestes, sons) n'est chargée que sur cette page
const OpeningTestBench = dynamic(() => import("@/components/admin/OpeningTestBench").then((m) => m.OpeningTestBench));

/** Banc de test de l'ouverture : vrais boosters et vraies cartes, tirages factices jamais enregistrés. */
export default async function AdminOpeningTestPage() {
  const { readOnly } = await requireAdminView();
  const [t, locale, offers, rules] = await Promise.all([
    getTranslations("admin.openingTest"),
    getLocale(),
    getBoosterOffers(),
    getBoosterRules(),
  ]);
  const [pool, sealedTypes, frescoes] = await Promise.all([
    openingTestPool(locale),
    getSealedDisplays(locale),
    // Fresques (brouillons compris) : l'admin seulement, le DEV ne doit pas les voir avant publication
    readOnly ? [] : testBenchFrescoes(locale),
  ]);
  // Les sachets scellés se testent par les scénarios de chute, pas comme des boosters à choisir
  // Boosters garantis : l'admin seulement (le DEV ne les voit nulle part)
  const types: OpeningType[] = offers.filter(({ type }) => type.kind !== "DROP" && !(readOnly && type.kind === "GUARANTEED")).map(({ type }) => {
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
      guaranteed: type.kind === "GUARANTEED",
      featured: null,
    };
  });

  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-heading text-2xl font-bold">{t("title")}</h2>
      <p className="text-sm text-text-muted">{t("intro")}</p>
      {types.length === 0 ? (
        <p className="text-sm text-text-muted">{t("noBooster")}</p>
      ) : (
        <OpeningTestBench types={types} pool={pool} initialState={testBoosterState()} sealedTypes={sealedTypes} frescoes={frescoes} />
      )}
    </section>
  );
}
