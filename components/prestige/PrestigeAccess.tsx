import { useTranslations } from "next-intl";
import type { CSSProperties } from "react";
import { Link } from "@/i18n/navigation";
import type { Eligibility } from "@/lib/prestige/eligibility";
import type { Blocker } from "@/server/prestige/queries";
import type { RarityInfo } from "./RebirthFlow";
import "./prestige.css";

/**
 * « Comment y accéder » : une jauge par rareté (possédées, exigées, total ; le trait marque le seuil), puis ce qui
 * bloque encore, avec un lien vers chaque élément.
 */
export function PrestigeAccess({ eligibility, blockers, rarities }: { eligibility: Eligibility; blockers: Blocker[]; rarities: RarityInfo[] }) {
  const t = useTranslations("prestige.access");
  const info = new Map(rarities.map((r) => [r.key, r]));
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-title text-lg font-extrabold">{t("title")}</h2>
      <p className="text-sm text-text-muted">{t("intro")}</p>
      <ul className="flex flex-col gap-3 lacquer rounded-card p-4">
        {eligibility.rows.map((row) => {
          const r = info.get(row.rarity);
          const style = { "--pr-color": r?.color ?? "var(--color-kin)" } as CSSProperties;
          return (
            <li key={row.rarity} className="grid grid-cols-[1.6rem_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1.5 text-sm" style={style}>
              <span aria-hidden="true" lang="ja" className="grid size-6 place-items-center rounded-[5px] font-seal text-[13px] text-washi-paper" style={{ background: "var(--pr-color)" }}>
                {r?.seal}
              </span>
              <b className="truncate">{r?.name ?? row.rarity}</b>
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
        })}
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
