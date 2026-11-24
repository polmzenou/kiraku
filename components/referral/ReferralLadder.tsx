import { useFormatter, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { RungView } from "@/server/referral/queries";
import { LotGifts } from "./LotGifts";

const RUNG: Record<RungView["state"], string> = {
  DONE: "border-hisui/60 bg-hisui/10",
  NEXT: "border-shu/60 bg-shu/5",
  LOCKED: "border-border bg-surface",
};
const STATE: Record<RungView["state"], string> = { DONE: "text-hisui", NEXT: "text-kin", LOCKED: "text-text-muted" };

/** Ce qu'un palier verse : son lot en images, puis ses extras (bons, carte 1/1, Ambassadeur, légende) sur une ligne. */
export function RungGifts({ rung: r }: { rung: RungView }) {
  const t = useTranslations("referralV2.ladder");
  const extras = [
    r.choiceVouchers > 0 ? t("vouchers", { count: r.choiceVouchers }) : null,
    r.oneOfOne ? t("oneOfOne") : null,
    r.ambassador ? (r.ambassadorState ? `${t("ambassador")} · ${t(`ambassadorState.${r.ambassadorState}`)}` : t("ambassador")) : null,
    r.legend ? t("legend") : null,
    !r.lot && r.choiceVouchers === 0 && !r.oneOfOne && !r.ambassador && !r.legend ? t("cosmetic") : null,
  ].filter(Boolean);
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-1">
      {r.lot && <LotGifts lot={r.lot} compact />}
      {extras.length > 0 && <span className="text-xs font-bold">{extras.join(" · ")}</span>}
    </span>
  );
}

/**
 * Échelle des paliers du parrain, en amis installés : ce que chacun verse, et où il en est. `limit` : paliers montrés
 * d'abord, les autres derrière « Voir les N paliers » (sans JavaScript).
 */
export function ReferralLadder({ ladder, installed, limit, hint = false }: { ladder: RungView[]; installed: number; limit?: number; hint?: boolean }) {
  const t = useTranslations("referralV2.ladder");
  const format = useFormatter();
  const rung = (r: RungView) => {
    return (
      <li key={r.installed} className={`flex items-center gap-3 rounded-card border p-2.5 ${RUNG[r.state]}`}>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-shu-btn font-heading text-sm tabular-nums text-washi-paper">
          {format.number(r.installed)}
        </span>
        <RungGifts rung={r} />
        <span className={`shrink-0 text-[11px] font-bold ${STATE[r.state]}`}>
          {r.state === "NEXT" ? t("state.NEXT", { count: r.installed - installed }) : t(`state.${r.state}`)}
        </span>
      </li>
    );
  };
  const first = limit ? ladder.slice(0, limit) : ladder;
  const rest = limit ? ladder.slice(limit) : [];
  return (
    <section className="flex flex-col gap-3 lacquer rounded-card p-4" aria-labelledby="paliers">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="paliers" className="font-title text-lg font-bold">{t("title")}</h2>
        <span className="text-xs text-text-muted">{t("installed", { count: installed })}</span>
      </div>
      {hint && <p className="text-xs text-text-muted">{t("hint")}</p>}
      <ol className="flex flex-col gap-2">{first.map(rung)}</ol>
      {rest.length > 0 && (
        <details className="group">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-bold text-ai group-open:hidden">{t("seeAll", { count: ladder.length })}</summary>
          <ol className="flex flex-col gap-2">{rest.map(rung)}</ol>
        </details>
      )}
      {ladder.some((r) => r.legend) && (
        <Link href="/parrainage/legendes" className="inline-flex min-h-11 items-center gap-2 self-start text-sm font-bold text-text-muted hover:text-text">
          <span aria-hidden="true" lang="ja" className="font-seal text-base text-shu">
            絵
          </span>
          {t("legendsLink")}
        </Link>
      )}
    </section>
  );
}
