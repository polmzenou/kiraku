import { useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { BoosterTypeForm } from "@/components/admin/BoosterTypeForm";
import { usePercent } from "@/components/boosters/format";
import { Link } from "@/i18n/navigation";
import { formFromType } from "@/lib/boosters/admin-form";
import { atLeastOdds } from "@/lib/boosters/odds";
import { effectiveSlotFloors, localize, SLUG_PATTERN } from "@/lib/boosters/types";
import { RARITIES, RARITY_SEAL, type Rarity } from "@/lib/catalog/rarity";
import { requireAdmin } from "@/server/admin";
import { adminBoosterType, featuredCandidates } from "@/server/admin-boosters";
import { getBoosterOffers } from "@/server/boosters/pools";
import { getBoosterRules } from "@/server/boosters/rules";

export default async function AdminBoosterTypePage({ params }: PageProps<"/[locale]/admin/boosters/types/[slug]">) {
  await requireAdmin();
  const { slug } = await params;
  if (!SLUG_PATTERN.test(slug)) notFound();
  const type = await adminBoosterType(slug);
  if (!type) notFound();

  const [t, locale, rules, offers, featured] = await Promise.all([
    getTranslations("admin.types"),
    getLocale(),
    getBoosterRules(),
    getBoosterOffers(),
    featuredCandidates(type.featuredCardIds),
  ]);
  const offer = offers.find((o) => o.type.slug === slug);
  const floors = effectiveSlotFloors(type.slotFloors, rules.draw.slotFloors);

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/boosters/types" className="text-sm text-ai underline underline-offset-4">
        ← {t("back")}
      </Link>
      <h2 className="font-title text-2xl font-bold">{t("editTitle", { name: localize(type.name, locale) })}</h2>

      {offer && <OddsTable floors={floors} rates={rules.draw.rates} counts={offer.counts} size={offer.size} />}

      <BoosterTypeForm initial={formFromType(type)} featured={featured} globalCards={rules.draw.slotFloors.length} />
    </div>
  );
}

/** Chances exactes du type sur son pool actuel : ce que voient les joueurs dans le panneau. */
function OddsTable({
  floors,
  rates,
  counts,
  size,
}: {
  floors: Rarity[];
  rates: Record<Rarity, number>;
  counts: Record<Rarity, number>;
  size: number;
}) {
  const t = useTranslations("admin.types");
  const tRarity = useTranslations("rarity");
  const percent = usePercent();
  const odds = atLeastOdds(rates, floors, counts);
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
      <h3 className="font-bold">{t("oddsTitle")}</h3>
      <p className="text-xs text-text-muted">
        {t("oddsHint")} {t("pool", { count: size })} ·{" "}
        <span lang="ja" className="font-seal">
          {floors.map((f) => RARITY_SEAL[f]).join(" · ")}
        </span>
      </p>
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
