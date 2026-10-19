import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { RARITIES } from "@/lib/catalog/rarity";
import { MARKET_SORTS, type MarketParams } from "@/lib/market/filters";
import { badgeClasses } from "../ui/Badge";
import { buttonClasses } from "../ui/Button";
import { inputClass, selectClass } from "../ui/Field";

const input = inputClass;

/**
 * Filtres du marché : un simple formulaire GET (fonctionne sans JavaScript, l'URL se partage).
 * Repliés tant qu'aucun filtre n'est actif, pour que les ventes restent au premier écran du
 * téléphone. Le serveur revalide chaque paramètre (lib/market/filters.ts).
 */
export async function MarketFilters({ params }: { params: MarketParams }) {
  const [t, tRarity] = await Promise.all([getTranslations("market.filters"), getTranslations("rarity")]);
  const reset = params.tab === "all" ? "/marche" : `/marche?onglet=${params.tab}`;
  const count = [params.rarity, params.q || null, params.minPrice, params.maxPrice, params.buyout || null].filter((v) => v !== null).length;
  return (
    <details open={count > 0} className="group lacquer rounded-card">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 font-bold [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          {t("label")}
          {count > 0 && <span className={badgeClasses("shu")}>{count}</span>}
        </span>
        <span aria-hidden="true" className="text-text-muted transition-transform group-open:rotate-180 motion-reduce:transition-none">
          ▾
        </span>
      </summary>
      <form method="get" className="grid grid-cols-2 gap-2 border-t border-border p-3 md:grid-cols-6 md:items-end">
        {params.tab !== "all" && <input type="hidden" name="onglet" value={params.tab} />}
        <label className="col-span-2 flex flex-col gap-1 text-xs text-text-muted">
          {t("search")}
          <input type="search" name="q" defaultValue={params.q} maxLength={50} className={input} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          {t("rarity")}
          <select name="rarete" defaultValue={params.rarity ?? ""} className={selectClass}>
            <option value="">{t("anyRarity")}</option>
            {RARITIES.map((r) => (
              <option key={r} value={r}>
                {tRarity(r)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          {t("sort")}
          <select name="tri" defaultValue={params.sort} className={selectClass}>
            {MARKET_SORTS.map((s) => (
              <option key={s} value={s}>
                {t(`sorts.${s}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          {t("minPrice")}
          <input type="number" name="min" min={1} inputMode="numeric" defaultValue={params.minPrice ?? ""} className={input} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          {t("maxPrice")}
          <input type="number" name="max" min={1} inputMode="numeric" defaultValue={params.maxPrice ?? ""} className={input} />
        </label>
        <label className="col-span-2 flex min-h-11 items-center gap-2 text-sm md:col-span-3">
          <input type="checkbox" name="immediat" value="1" defaultChecked={params.buyout} className="choice" />
          {t("buyout")}
        </label>
        <div className="col-span-2 flex gap-2 md:col-span-3 md:justify-end">
          <Link href={reset} className={buttonClasses("secondary", "flex-1 md:flex-none")}>
            {t("reset")}
          </Link>
          <button type="submit" className={buttonClasses("primary", "flex-1 md:flex-none")}>
            {t("apply")}
          </button>
        </div>
      </form>
    </details>
  );
}
