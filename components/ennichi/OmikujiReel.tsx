"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { luckOf } from "@/lib/ennichi/omikuji";
import { Button } from "../ui/Button";

const PAGE_MS = 1400;

export type ReelDraw = { n: number; line: number; name: string; me: boolean };

/**
 * Rediffusion du tirage de l'omikuji (maquette « Rouleaux ») : les feuilles se déroulent page par page dans l'ordre du
 * tirage, puis restent les feuilles qui comptent (la grande chance, les lots du joueur, un lot de chaque ligne).
 * Rejouable, passable ; avec le mouvement réduit, le résumé directement (règles de ennichi.css).
 */
export function OmikujiReel({ draws, lotNames, stageStyle }: { draws: ReelDraw[]; lotNames: string[]; /** Fond du sanctuaire (variables de themedBg). */ stageStyle?: CSSProperties }) {
  const t = useTranslations("ennichi.omikuji");
  const [per, setPer] = useState(4);
  const [run, setRun] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    const desk = window.matchMedia("(min-width: 768px)");
    const update = () => setPer(desk.matches ? 7 : 4);
    update();
    desk.addEventListener("change", update);
    return () => desk.removeEventListener("change", update);
  }, []);

  const summary = useMemo(() => {
    const out: ReelDraw[] = [];
    const best = draws.find((d) => d.line === 0);
    if (best) out.push(best);
    for (const d of draws) if (d.me && out.length < per && !out.includes(d)) out.push(d);
    for (const line of [...new Set(draws.map((d) => d.line))]) {
      const d = draws.find((x) => x.line === line && !out.includes(x));
      if (d && out.length < per) out.push(d);
    }
    for (const d of draws) {
      if (out.length >= per) break;
      if (!out.includes(d)) out.push(d);
    }
    return out.sort((a, b) => a.n - b.n);
  }, [draws, per]);

  const pages = useMemo(() => {
    const list: ReelDraw[][] = [];
    for (let i = 0; i < draws.length; i += per) list.push(draws.slice(i, i + per));
    list.push(summary);
    return list;
  }, [draws, per, summary]);
  const total = pages.length * PAGE_MS;

  useEffect(() => {
    if (!playing) return;
    const id = setTimeout(() => setPlaying(false), total);
    return () => clearTimeout(id);
  }, [playing, total, run]);

  if (draws.length === 0) {
    return (
      <div className="kuji-stage themed-bg" style={stageStyle}>
        <p className="m3-nodraw">{t("noDraw")}</p>
      </div>
    );
  }

  const roll = (d: ReelDraw, delay: number | null) => (
    <div key={d.n} className={`roll is-on${d.me ? " me" : ""}`} style={delay !== null ? { ["--rd" as string]: `${delay}ms` } : undefined}>
      <b lang="ja">{luckOf(d.line)}</b>
      <span>
        {lotNames[d.line] ?? ""}
        <br />
        {d.me ? t("you") : d.name}
      </span>
      <i>{t("drawNo", { n: d.n })}</i>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="kuji-stage themed-bg" style={stageStyle}>
        {playing ? (
          <>
            <div className="m3-reel" key={run}>
              <div
                className="m3-reel-track"
                style={{ ["--p" as string]: pages.length, width: `${pages.length * 100}%`, animationDuration: `${total}ms`, animationTimingFunction: `steps(${pages.length}, jump-none)` }}
              >
                {pages.map((page, p) => (
                  <div key={p} className="m3-rpage" style={{ width: `${(100 / pages.length).toFixed(4)}%` }}>
                    {page.map((d, j) => roll(d, p * PAGE_MS + j * 180))}
                  </div>
                ))}
              </div>
            </div>
            <div className="m3-reel-bar" aria-hidden="true" key={`bar-${run}`}>
              <i style={{ animationDuration: `${Math.max(1, pages.length - 1) * PAGE_MS}ms` }} />
            </div>
          </>
        ) : (
          <div className="rolls">{summary.map((d) => roll(d, null))}</div>
        )}
      </div>
      <div className="m3-kuji-ctl">
        <span className="text-xs text-text-muted">{playing ? t("replaying", { count: draws.length }) : t("summary")}</span>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setRun((r) => r + 1);
              setPlaying(true);
            }}
          >
            {t("replay")}
          </Button>
          {playing && (
            <Button type="button" size="sm" variant="ghost" onClick={() => setPlaying(false)}>
              {t("skip")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
