
import { useRarities, useRaritySeals } from "@/lib/catalog/use-rarities";
import { useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { BoosterTypeForm } from "@/components/admin/BoosterTypeForm";
import { ReadOnly } from "@/components/admin/ReadOnly";
import { usePercent } from "@/components/boosters/format";
import { Link } from "@/i18n/navigation";
import { formFromType } from "@/lib/boosters/admin-form";
import { SEALED_KINDS } from "@/lib/boosters/draw";
import { atLeastOdds, sealedOdds, type RarityOdds } from "@/lib/boosters/odds";
import { localize, SLUG_PATTERN, typeDrawRules } from "@/lib/boosters/types";
import { type Rarity } from "@/lib/catalog/rarity";
import { requireAdminView } from "@/server/admin";
import { adminBoosterType, featuredCandidates, focusSeriesCandidates } from "@/server/admin-boosters";
import { getBoosterOffers } from "@/server/boosters/pools";
import { getBoosterRules } from "@/server/boosters/rules";

export default async function AdminBoosterTypePage({ params }: PageProps<"/[locale]/admin/boosters/types/[slug]">) {
  const { readOnly } = await requireAdminView();
  const { slug } = await params;
  if (!SLUG_PATTERN.test(slug)) notFound();
  const type = await adminBoosterType(slug);
  if (!type || (readOnly && type.kind === "GUARANTEED")) notFound();

  const [t, locale, rules, offers, featured, focusSeries] = await Promise.all([
    getTranslations("admin.types"),
    getLocale(),
    getBoosterRules(),
    getBoosterOffers(),
    featuredCandidates(type.featuredCardIds),
    focusSeriesCandidates(type.focusSeriesIds),
  ]);
  const offer = offers.find((o) => o.type.slug === slug);
  // Planchers et taux du type (boostés pour un Impérial), comme dans le panneau des joueurs
  const draw = typeDrawRules(type, rules.draw);
  // Booster garanti : la dernière carte ne se tire pas, elle est toujours de sa rareté
  const guaranteed = type.kind === "GUARANTEED" ? type.guaranteed : null;
  // Sachet scellé : tiré avec les planchers divins (et la ruine pour l'Apocalyptique), pas ceux du type.
  // Un type DROP hors des sachets connus ne s'ouvre jamais : pas de tableau.
  const sealedKind = type.kind === "DROP" ? (SEALED_KINDS.find((k) => k === type.slug) ?? null) : null;
  const sealed = offer && sealedKind ? sealedOdds(sealedKind, draw, rules.ruin, offer.counts) : null;
  const floors = sealed ? sealed.divineFloors : guaranteed ? draw.slotFloors.slice(0, -1) : [...draw.slotFloors];
  const odds = !offer ? null : sealed ? sealed.atLeast : type.kind === "DROP" ? null : atLeastOdds(draw.rates, floors, offer.counts);

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/boosters/types" className="text-sm text-link underline underline-offset-4">
        ← {t("back")}
      </Link>
      <h2 className="font-heading text-2xl font-bold">{t("editTitle", { name: localize(type.name, locale) })}</h2>

      {offer && odds && (
        <OddsTable
          floors={floors}
          odds={odds}
          counts={offer.counts}
          size={offer.size}
          guaranteed={guaranteed}
          sealed={sealed && { sparedShare: sealed.sparedShare, ruinFloors: [...rules.ruin.floors] }}
        />
      )}

      <ReadOnly when={readOnly}>
        <BoosterTypeForm initial={formFromType(type)} featured={featured} focusSeries={focusSeries} globalCards={rules.draw.slotFloors.length} />
      </ReadOnly>
    </div>
  );
}

/** Chances exactes du type sur son pool actuel : ce que voient les joueurs dans le panneau. */
function OddsTable({
  floors,
  odds,
  counts,
  size,
  guaranteed,
  sealed,
}: {
  /** Planchers réellement tirés (planchers divins pour un sachet scellé). */
  floors: Rarity[];
  odds: RarityOdds;
  counts: Record<Rarity, number>;
  size: number;
  /** Booster garanti : rareté de la dernière carte (hors des chances du tableau). */
  guaranteed: Rarity | null;
  /** Sachet scellé : part épargnée de l'Apocalyptique (null pour un Divin) et planchers de ruine. */
  sealed: { sparedShare: number | null; ruinFloors: Rarity[] } | null;
}) {
  const RARITIES = useRarities();
  const RARITY_SEAL = useRaritySeals();
  const t = useTranslations("admin.types");
  const tRarity = useTranslations("rarity");
  const percent = usePercent();
  const seals = (list: readonly Rarity[]) => list.map((f) => RARITY_SEAL[f]).join(" · ");
  return (
    <section className="flex flex-col gap-2 lacquer rounded-card p-4">
      <h3 className="font-bold">{t("oddsTitle")}</h3>
      <p className="text-xs text-text-muted">
        {t("oddsHint")} {t("pool", { count: size })} ·{" "}
        <span lang="ja" className="font-seal">
          {seals(floors)}
        </span>
      </p>
      {sealed && (
        <p className="text-xs text-text-muted">
          {t("sealedFloors")}
          {sealed.sparedShare !== null && (
            <>
              {" "}
              {t("sealedApocalypse", { share: percent(sealed.sparedShare) })}{" "}
              <span lang="ja" className="font-seal">
                {seals(sealed.ruinFloors)}
              </span>
            </>
          )}
        </p>
      )}
      {guaranteed && (
        <p className="text-sm font-bold text-shu">
          <span aria-hidden="true" lang="ja" className="font-seal">
            {RARITY_SEAL[guaranteed]}
          </span>{" "}
          {t("guaranteedLast", { rarity: tRarity(guaranteed), count: counts[guaranteed] ?? 0 })}
        </p>
      )}
      <table className="w-full text-sm tabular-nums">
        <tbody>
          {RARITIES.slice(2).map((r) => (
            <tr key={r} className="border-t border-border">
              <th scope="row" className="py-1.5 text-left font-normal">
                <span aria-hidden="true" lang="ja" className="font-seal">
                  {RARITY_SEAL[r]}
                </span>{" "}
                {tRarity(r)}+
              </th>
              <td className="py-1.5 text-right text-text-muted">{counts[r]}</td>
              <td className="py-1.5 text-right font-bold">{percent(odds[r])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
