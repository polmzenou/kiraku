import { useTranslations } from "next-intl";
import type { CSSProperties } from "react";
import { Link } from "@/i18n/navigation";
import type { Eligibility } from "@/lib/prestige/eligibility";
import type { Blocker } from "@/server/prestige/queries";
import type { RarityInfo } from "./RebirthFlow";
import "./prestige.css";

type Row = Eligibility["rows"][number];

/** Rayon et circonférence du cercle ensō (repère 62 × 62). */
const R = 26;
const C = 2 * Math.PI * R;

/**
 * Jauge ensō d'une rareté (téléphone) : un cercle au pinceau rempli de ce que possède le joueur, le point marque le
 * seuil ; le sceau de la rareté au centre.
 */
function EnsoGauge({ row, info }: { row: Row; info: RarityInfo | undefined }) {
  const t = useTranslations("prestige.access");
  const value = Math.min(1, row.owned / row.published);
  const angle = (row.required / row.published) * 2 * Math.PI - Math.PI / 2;
  const color = info?.color ?? "var(--color-kin)";
  return (
    <li className="flex min-w-0 flex-col items-center gap-1 text-center">
      <span className="sr-only">{t("gaugeLabel", { name: info?.name ?? row.rarity, owned: row.owned, required: row.required })}</span>
      <span aria-hidden="true" className="relative size-[62px]">
        <svg viewBox="0 0 62 62" className="size-full">
          <circle cx="31" cy="31" r={R} fill="none" stroke="var(--color-surface-2)" strokeWidth="6" />
          <circle cx="31" cy="31" r={R} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${(C * value).toFixed(1)} ${C.toFixed(1)}`} transform="rotate(-90 31 31)" />
          <circle cx={(31 + Math.cos(angle) * R).toFixed(1)} cy={(31 + Math.sin(angle) * R).toFixed(1)} r="3.2" fill="var(--color-text)" />
        </svg>
        <span lang="ja" className="absolute inset-0 grid place-items-center font-seal text-lg">
          {info?.seal}
        </span>
      </span>
      <b aria-hidden="true" className="text-xs tabular-nums">
        {row.owned} / {row.required}
      </b>
      <span aria-hidden="true" className={`text-[11px] font-bold ${row.met ? "text-hisui" : "text-shu"}`}>
        {row.met ? t("reached") : t("toGo", { count: row.required - row.owned })}
      </span>
    </li>
  );
}

/** Barre d'une rareté (ordinateur) : possédées, exigées, total ; le trait marque le seuil. */
function BarGauge({ row, info }: { row: Row; info: RarityInfo | undefined }) {
  const t = useTranslations("prestige.access");
  const style = { "--pr-color": info?.color ?? "var(--color-kin)" } as CSSProperties;
  return (
    <li className="grid grid-cols-[1.6rem_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1.5 text-sm" style={style}>
      <span aria-hidden="true" lang="ja" className="grid size-6 place-items-center rounded-[5px] font-seal text-[13px] text-washi-paper" style={{ background: "var(--pr-color)" }}>
        {info?.seal}
      </span>
      <b className="truncate">{info?.name ?? row.rarity}</b>
      <span className="tabular-nums text-text-muted">
        <b className="text-text">{row.owned}</b> / {row.required}{" "}
        {row.met ? <span className="font-bold text-hisui">{t("met")}</span> : <span className="font-bold text-shu">{t("missing", { count: row.required - row.owned })}</span>}
      </span>
      <span className="pr-track col-span-2 col-start-2" aria-hidden="true">
        <span>
          <i style={{ transform: `scaleX(${Math.min(1, row.owned / row.published).toFixed(3)})` }} />
        </span>
        <b style={{ left: `${((row.required / row.published) * 100).toFixed(1)}%` }} />
      </span>
    </li>
  );
}

/**
 * « Comment y accéder » : une jauge par rareté (cercles ensō sur téléphone, barres sur ordinateur), puis ce qui
 * bloque encore, avec un lien vers chaque élément.
 */
export function PrestigeAccess({ eligibility, blockers, rarities }: { eligibility: Eligibility; blockers: Blocker[]; rarities: RarityInfo[] }) {
  const t = useTranslations("prestige.access");
  const info = new Map(rarities.map((r) => [r.key, r]));
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-title text-lg font-extrabold">{t("title")}</h2>
      <p className="text-sm text-text-muted">{t("intro")}</p>
      <ul className="grid grid-cols-4 gap-x-2 gap-y-4 lacquer rounded-card px-2.5 py-4 lg:hidden">
        {eligibility.rows.map((row) => (
          <EnsoGauge key={row.rarity} row={row} info={info.get(row.rarity)} />
        ))}
      </ul>
      <ul className="hidden flex-col gap-3 lacquer rounded-card p-4 lg:flex">
        {eligibility.rows.map((row) => (
          <BarGauge key={row.rarity} row={row} info={info.get(row.rarity)} />
        ))}
      </ul>
      {blockers.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="font-bold">{t("blockersTitle")}</h3>
          <ul className="flex flex-col gap-2">
            {blockers.map((b) => (
              <li key={b.kind} className="flex items-center gap-3 lacquer rounded-card p-3 text-sm">
                <span className="min-w-0 flex-1">{t(`blocker.${b.kind}`, { count: b.count })}</span>
                <Link href={b.href} className="inline-flex min-h-11 items-center font-bold text-link underline underline-offset-4">
                  {t("see")}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
