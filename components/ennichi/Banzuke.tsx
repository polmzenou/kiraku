import { getFormatter, getTranslations } from "next-intl/server";
import { rankBand, type EnnichiTitle } from "@/lib/ennichi/rules";
import type { BanzukeRow, BanzukeView, EnnichiView, RankView } from "@/server/ennichi/queries";
import { LotGifts } from "../referral/LotGifts";
import { PlayerAvatar } from "../social/PlayerAvatar";
import { bgOf, DohyoRing, Hanabi, Lantern, Tsuna, themedBg } from "./parts";

export const TITLE_KANJI: Record<EnnichiTitle, string> = { yokozuna: "横綱", ozeki: "大関", sekiwake: "関脇" };

/** Ce qu'une ligne de lots donne : le lot, les bons, la carte 1/1 (le titre est dit à part). */
export async function RankPrize({ band, compact = true }: { band: RankView; compact?: boolean }) {
  const t = await getTranslations("ennichi.banzuke");
  return (
    <div className="flex flex-col gap-1">
      {band.lot && <LotGifts lot={band.lot} compact={compact} />}
      {(band.choiceVouchers > 0 || band.oneOfOne) && (
        <span className="text-xs font-bold">
          {[band.oneOfOne ? t("oneOfOne") : null, band.choiceVouchers > 0 ? t("vouchers", { count: band.choiceVouchers }) : null].filter(Boolean).join(" · ")}
        </span>
      )}
    </div>
  );
}

/** Affiche du banzuke (maquette « Tableau de sumo ») sur le papier PV2-BANZUKE-PAPIER : une ligne par rang de lots. */
export async function BanzukePoster({ view, bz }: { view: EnnichiView; bz: BanzukeView }) {
  const [t, format] = await Promise.all([getTranslations("ennichi.banzuke"), getFormatter()]);
  const line = (r: BanzukeRow) => (
    <div key={r.rank} className={`bzk-n ${r.me ? "me" : ""}`}>
      <i>{r.rank}</i>
      <b>{r.me ? t("you") : r.name}</b>
      <i>{t("friends", { count: r.count })}</i>
    </div>
  );
  const bands = view.ranks.map((b) => {
    const rows = bz.rows.filter((r) => r.rank >= b.from && r.rank <= b.to);
    let shown: (BanzukeRow | null)[] = rows;
    if (rows.length > 7) {
      shown = rows.slice(0, 5);
      const me = rows.find((r) => r.me);
      if (me && !shown.includes(me)) shown = [...shown, null, me];
    }
    const more = rows.length - shown.filter(Boolean).length;
    return (
      <div key={b.from} className="bzk-row">
        <span lang={b.title ? "ja" : undefined} className={`bzk-rank ${b.title ? "" : "plain"}`}>
          {b.title ? TITLE_KANJI[b.title] : `${b.from}–${b.to}`}
        </span>
        <div className="bzk-names">
          {shown.length ? shown.map((r, i) => (r ? line(r) : <div key={`gap-${i}`} className="bzk-n m3-gap" aria-hidden="true"><i /><b>…</b><i /></div>)) : <span className="bzk-prize m3-free">{t("free")}</span>}
          {more > 0 && <span className="bzk-prize">{t("others", { count: more })}</span>}
          {b.title && <span className="bzk-prize">{t("titleOf", { title: t(`titles.${b.title}`) })}</span>}
          <RankPrize band={b} />
        </div>
      </div>
    );
  });
  const out = bz.me && !rankBand(bz.me.rank, view.ranks);
  return (
    <div className="bzk" style={bgOf("banzuke-papier", "cover", "50% 0%")}>
      <div className="bzk-head">
        <b lang="ja">番付</b>
        <span>
          {t("poster", { year: view.year })}
          <br />
          <small>{bz.final ? t("final") : t("today")}</small>
        </span>
      </div>
      {bands}
      {out && bz.me && (
        <div className="bzk-row m3-out">
          <span className="bzk-rank plain">{t("ord", { rank: bz.me.rank })}</span>
          <div className="bzk-names">
            {line(bz.me)}
            <span className="bzk-prize">{t("outOfPrizes", { count: format.number(view.lastPaidRank) })}</span>
          </div>
        </div>
      )}
    </div>
  );
}

const NOBORI = ["vermillon", "ivoire", "indigo"] as const;

/**
 * Podium final, maquette A « Dohyō » (choisie le 2026-11-24) : le cercle de sumo du sanctuaire, les nobori des trois
 * premiers avec leur titre, leurs avatars sur le dohyō, la corde du Yokozuna, lanternes et hanabi. Entrée orchestrée en
 * CSS (transform et opacity), coupée par le mouvement réduit.
 */
export async function DohyoStage({ view, top }: { view: EnnichiView; top: (BanzukeRow & { image: string | null })[] }) {
  const t = await getTranslations("ennichi.banzuke");
  const col = [top.find((r) => r.rank === 2) ?? null, top.find((r) => r.rank === 1) ?? null, top.find((r) => r.rank === 3) ?? null];
  const pos = ["l", "c", "r"] as const;
  const label = t("podiumLabel", {
    first: col[1] ? `${col[1].name} (${col[1].count})` : t("freePlace"),
    second: col[0] ? `${col[0].name} (${col[0].count})` : t("freePlace"),
    third: col[2] ? `${col[2].name} (${col[2].count})` : t("freePlace"),
  });
  return (
    <div className="m3-stage m3-dohyo m3-play" style={{ ["--el" as string]: "0ms" }} role="img" aria-label={label}>
      <div className="m3-st-bg themed-bg" style={themedBg("sanctuaire")} />
      <Hanabi />
      <div className="m3-garland" aria-hidden="true">
        <svg viewBox="0 0 100 40" preserveAspectRatio="none">
          <path d="M0 6 Q 50 34 100 6" />
        </svg>
        {Array.from({ length: 6 }, (_, i) => {
          const x = 8 + i * 16.8;
          const y = 6 + Math.sin((x / 100) * Math.PI) * 14;
          return (
            <span key={i} className="m3-gl" style={{ left: `calc(${x.toFixed(2)}% - 12px)`, top: `${y.toFixed(1)}px` }}>
              <Lantern kanji="祭" on width={24} />
            </span>
          );
        })}
      </div>
      <div className="m3-nobs" aria-hidden="true">
        {col.map((r, i) => {
          const rank = [2, 1, 3][i];
          const title = rankBand(rank, view.ranks)?.title ?? null;
          const name = r?.name ?? "";
          const room = pos[i] === "c" ? 118 : 90;
          const fs = Math.max(9, Math.min(pos[i] === "c" ? 18 : 15, Math.floor(room / Math.max(1, [...name].length))));
          return (
            <div key={pos[i]} className={`m3-nob m3-nob-${pos[i]}${r?.me ? " is-me" : ""}`}>
              <div className="m3-nob-art" style={bgOf(`nobori/${NOBORI[i]}`, "100% 100%")}>
                <div className="m3-nob-cloth">
                  <span lang="ja" className="m3-nob-k">
                    {title ? TITLE_KANJI[title] : "番"}
                  </span>
                  {r ? (
                    <>
                      <span className="m3-nob-name" style={{ fontSize: fs }}>
                        {name}
                      </span>
                      <span className="m3-nob-n">
                        {r.count}
                        <small>{t("friendsShort", { count: r.count })}</small>
                      </span>
                    </>
                  ) : (
                    <span className="m3-nob-name m3-nob-free">—</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <DohyoRing />
      <div className="m3-rks" aria-hidden="true">
        {col.map((r, i) =>
          r ? (
            <div key={pos[i]} className={`m3-rk m3-rk-${pos[i]}${r.me ? " is-me" : ""}`}>
              <span className="av inline-flex rounded-full">
                <PlayerAvatar username={r.name} image={r.image} size={pos[i] === "c" ? 62 : 46} />
              </span>
              {pos[i] === "c" && <Tsuna className="m3-tsuna-rk" />}
              {r.me && <span className="m3-toi">{t("you")}</span>}
            </div>
          ) : (
            <div key={pos[i]} className={`m3-rk m3-rk-${pos[i]} is-free`} />
          ),
        )}
      </div>
    </div>
  );
}
