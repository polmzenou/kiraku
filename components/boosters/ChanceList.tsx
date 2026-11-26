import { useTranslations } from "next-intl";
import { chanceRows, type BoosterPanelData } from "@/lib/boosters/panel";
import { useRaritySeals } from "@/lib/catalog/use-rarities";
import { RARITY_BG, RARITY_TEXT, usePercent } from "./format";

/**
 * Deux mises en page des mêmes lignes : le panneau des taux (surfaces du thème, noms à la couleur de leur
 * rareté) et le hero de la vitrine (encre du booster choisi, seul le sceau vedette est en or).
 */
const STYLE = {
  panel: { row: "grid grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-3 text-xs", label: "font-bold", seal: "font-seal text-sm", track: "bg-surface-2", tinted: true },
  hero: { row: "grid grid-cols-[8rem_minmax(0,1fr)_3.75rem] items-center gap-3 text-[13px] font-bold", label: "", seal: "font-seal", track: "bg-[var(--track)]", tinted: false },
} as const;

const cx = (...classes: string[]) => classes.filter(Boolean).join(" ");

/**
 * Chances d'un booster : une ligne par seuil de rareté (sceau, nom, barre en scaleX, pourcentage, phrase
 * complète pour les lecteurs d'écran), puis la ligne vedette ou Focus. Partagée par le panneau des taux
 * et le hero de la vitrine : une correction (contraste, nouvelle rareté, arrondi) vaut pour les deux.
 */
export function ChanceList({ panel, variant }: { panel: Pick<BoosterPanelData, "odds" | "inPool" | "featured">; variant: keyof typeof STYLE }) {
  const RARITY_SEAL = useRaritySeals();
  const t = useTranslations("boosters");
  const tRarity = useTranslations("rarity");
  const percent = usePercent();
  const s = STYLE[variant];

  return (
    <ul className="flex flex-col gap-2">
      {chanceRows(panel).map((r) => (
        <li key={r} className={s.row}>
          <span className={cx("flex min-w-0 items-center gap-1.5", s.label, s.tinted ? RARITY_TEXT[r] : "")}>
            <span aria-hidden="true" lang="ja" className={s.seal}>
              {RARITY_SEAL[r]}
            </span>
            <span className="truncate">{tRarity(r)}</span>
          </span>
          <span aria-hidden="true" className={`h-1.5 overflow-hidden rounded-full ${s.track}`}>
            <span className={`block h-full origin-left rounded-full ${RARITY_BG[r]}`} style={{ transform: `scaleX(${Math.max(panel.odds[r], 0.02)})` }} />
          </span>
          <span className="text-right tabular-nums">
            <span className="sr-only">{t("chanceRow", { rarity: tRarity(r), value: percent(panel.odds[r]) })}</span>
            <span aria-hidden="true">{percent(panel.odds[r])}</span>
          </span>
        </li>
      ))}
      {panel.featured && (
        <li className={s.row}>
          {/* Or de la Légendaire : rarity-label-legendary sur les surfaces du thème (le kin de Washi n'y fait que 2,45:1) */}
          <span className={cx("flex min-w-0 items-center gap-1.5", s.label, s.tinted ? "text-rarity-label-legendary" : "")}>
            <span aria-hidden="true" lang="ja" className={cx(s.seal, s.tinted ? "" : "text-kin")}>
              星
            </span>
            <span className="truncate">{t(panel.featured.focus ? "focusChance" : "featuredChance")}</span>
          </span>
          <span aria-hidden="true" className={`h-1.5 overflow-hidden rounded-full ${s.track}`}>
            <span className="block h-full origin-left rounded-full bg-kin" style={{ transform: `scaleX(${Math.max(panel.featured.chance, 0.02)})` }} />
          </span>
          <span className="text-right tabular-nums">
            <span className="sr-only">{t(panel.featured.focus ? "focusRow" : "featuredRow", { value: percent(panel.featured.chance) })}</span>
            <span aria-hidden="true">{percent(panel.featured.chance)}</span>
          </span>
        </li>
      )}
    </ul>
  );
}
