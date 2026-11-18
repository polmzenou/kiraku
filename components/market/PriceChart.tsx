"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { PricePoint } from "@/lib/market/quotes";

// Courbe de la cote d'une carte : cote glissante de chaque jour de vente (ligne kin) et chaque vente (points).
// Une seule série : pas de légende, le titre de la section la nomme. Survol, toucher ou flèches du
// clavier : réticule sur le jour le plus proche et bulle (date, cote, ventes du jour). Les mêmes chiffres
// sont dans un tableau pour les lecteurs d'écran. Aucune animation.

const HEIGHT = 168;
const PAD = { top: 12, right: 14, bottom: 24, left: 48 };
const DAY_MS = 86_400_000;

type Props = {
  days: PricePoint[];
  sales: { price: number; at: string }[];
  historyDays: number;
  /** Instant du calcul (ISO) : bord droit de l'axe du temps. */
  now: string;
  /** Résumé lu par les lecteurs d'écran (cote, tendance, nombre de ventes). */
  summary: string;
};

/** Graduations rondes (1, 2 ou 5 × 10^n) couvrant [min, max]. */
export function niceTicks(min: number, max: number, count = 3): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) return [min];
  const raw = (max - min) / Math.max(1, count - 1);
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * power).find((s) => s >= raw) ?? raw;
  const ticks: number[] = [];
  for (let v = Math.floor(min / step) * step; v <= max + step / 2; v += step) ticks.push(Math.round(v));
  return ticks;
}

/** Bornes de l'axe des prix : toute la ligne de cote, et les ventes sauf celles hors norme. */
export function scaleBounds(salePrices: readonly number[], linePrices: readonly number[]): { lo: number; hi: number } {
  const sorted = [...salePrices].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))];
  const [q1, q3] = [at(0.25), at(0.75)];
  const margin = Math.max(3 * (q3 - q1), 0.25 * at(0.5));
  const kept = sorted.filter((p) => p >= q1 - margin && p <= q3 + margin);
  const all = [...linePrices, ...kept];
  return all.length === 0 ? { lo: 0, hi: 0 } : { lo: Math.min(...all), hi: Math.max(...all) };
}

/** Milieu d'un jour « AAAA-MM-JJ » : position du point sur l'axe du temps. */
const dayTime = (day: string) => Date.parse(`${day}T12:00:00Z`);

export function PriceChart({ days, sales, historyDays, now, summary }: Props) {
  const t = useTranslations("market.quote");
  const format = useFormatter();
  const tableId = useId();
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.round(entry.contentRect.width))));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const end = Date.parse(now);
  const start = end - historyDays * DAY_MS;
  // Échelle robuste : la ligne de cote entière et les ventes dans les barrières de Tukey (3 écarts
  // interquartiles, au moins ±25 % de la médiane). Une vente hors norme ne l'écrase pas : elle est posée au
  // bord du graphique, en cercle creux.
  const { lo, hi } = scaleBounds(sales.map((s) => s.price), days.map((d) => d.price));
  // Marge de 10 % de l'étendue ; un seul prix (ou une cote plate) s'affiche à ±25 %
  const pad = hi > lo ? (hi - lo) * 0.1 : Math.max(1, hi * 0.25);
  const ticks = niceTicks(Math.max(0, lo - pad), hi + pad);
  const yMin = Math.min(ticks[0] ?? lo, lo);
  const yMax = Math.max(ticks[ticks.length - 1] ?? hi, hi);
  const clamp = (price: number) => Math.min(yMax, Math.max(yMin, price));

  const plotW = width - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const x = (time: number) => PAD.left + ((time - start) / (end - start)) * plotW;
  const y = (price: number) => PAD.top + (yMax === yMin ? plotH / 2 : (1 - (price - yMin) / (yMax - yMin)) * plotH);
  const points = days.map((d) => ({ ...d, cx: x(dayTime(d.day)), cy: y(d.price) }));
  const line = points.map((p, i) => `${i ? "L" : "M"}${p.cx.toFixed(1)} ${p.cy.toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  const focus = active !== null ? points[active] : null;

  const compact = (n: number) => format.number(n, { notation: n >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 });
  const dayLabel = (day: string) => format.dateTime(new Date(dayTime(day)), { day: "numeric", month: "short", timeZone: "UTC" });

  const nearest = (clientX: number) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect || points.length === 0) return null;
    const px = clientX - rect.left;
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(points[i].cx - px) < Math.abs(points[best].cx - px)) best = i;
    return best;
  };
  const onPointer = (e: PointerEvent<SVGSVGElement>) => setActive(nearest(e.clientX));
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (points.length === 0) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const from = active ?? points.length - 1;
      setActive(Math.min(points.length - 1, Math.max(0, from + (e.key === "ArrowRight" ? 1 : -1))));
    } else if (e.key === "Escape") setActive(null);
  };

  return (
    <div ref={box} className="relative w-full">
      <svg
        // Largeur fluide, hauteur fixe : avant la mesure, le dessin reste proportionné dans le cadre, sans saut
        viewBox={`0 0 ${width} ${HEIGHT}`}
        role="img"
        aria-label={summary}
        aria-describedby={tableId}
        tabIndex={0}
        className="block h-[168px] w-full touch-pan-y rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kin"
        onPointerMove={onPointer}
        onPointerDown={onPointer}
        onPointerLeave={(e) => e.pointerType === "mouse" && setActive(null)}
        onKeyDown={onKey}
        onBlur={() => setActive(null)}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(tick)} y2={y(tick)} stroke="var(--color-border)" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(tick)} textAnchor="end" dominantBaseline="middle" className="fill-text-muted text-[11px] tabular-nums">
              {compact(tick)}
            </text>
          </g>
        ))}
        <text x={PAD.left} y={HEIGHT - 6} className="fill-text-muted text-[11px]">{t("chartSince", { days: historyDays })}</text>
        <text x={width - PAD.right} y={HEIGHT - 6} textAnchor="end" className="fill-text-muted text-[11px]">{t("chartToday")}</text>

        {sales.map((s, i) => {
          const outside = clamp(s.price) !== s.price;
          return outside ? (
            <circle key={i} cx={x(Date.parse(s.at))} cy={y(clamp(s.price))} r={3.5} fill="none" stroke="var(--color-text-muted)" strokeWidth={1.5} />
          ) : (
            <circle key={i} cx={x(Date.parse(s.at))} cy={y(s.price)} r={3.5} fill="var(--color-text-muted)" fillOpacity={0.45} />
          );
        })}
        {points.length > 1 && (
          <path d={line} fill="none" stroke="var(--color-chart-line)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        )}
        {focus && <line x1={focus.cx} x2={focus.cx} y1={PAD.top} y2={PAD.top + plotH} stroke="var(--color-text-muted)" strokeWidth={1} />}
        {(focus ?? last) && (
          <circle
            cx={(focus ?? last)!.cx}
            cy={(focus ?? last)!.cy}
            r={5}
            fill="var(--color-chart-line)"
            stroke="var(--color-surface)"
            strokeWidth={2}
          />
        )}
      </svg>

      {focus && (
        <div
          role="status"
          className="pointer-events-none absolute top-0 z-10 flex -translate-x-1/2 flex-col rounded-sm border border-border bg-surface-2 px-2 py-1 text-xs shadow-raised"
          style={{ left: Math.min(width - 70, Math.max(70, focus.cx)) }}
        >
          <span className="text-text-muted">{dayLabel(focus.day)}</span>
          <span className="font-bold tabular-nums">{t("zeni", { amount: focus.price })}</span>
          <span className="text-text-muted">{t("salesCount", { count: focus.sales })}</span>
        </div>
      )}

      <table id={tableId} className="sr-only">
        <caption>{t("tableCaption")}</caption>
        <thead>
          <tr>
            <th scope="col">{t("tableDay")}</th>
            <th scope="col">{t("tableMedian")}</th>
            <th scope="col">{t("tableSales")}</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.day}>
              <td>{dayLabel(d.day)}</td>
              <td>{t("zeni", { amount: d.price })}</td>
              <td>{d.sales}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
