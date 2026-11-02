"use client";

import { useIsPresent } from "motion/react";
import { createContext, useContext, useLayoutEffect, useMemo, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { mangaStrokes } from "@/lib/opening/manga-brush";
import { REVEAL_SCENES, seeded, xrGeometry, type RevealSceneKey } from "@/lib/opening/reveal-scenes";
import { CardBack } from "../fuda/CardBack";
import "./RevealScene.css";

// Révélations plein écran des raretés visuelles. Deux calques encadrent la carte : l'un sous la pile (fond),
// l'autre au-dessus (brouillard, encre, éclats). Rendus hors de la carte : sa perspective casserait le `fixed`.

/** Hôte du calque sous la pile, placé par OpeningStage entre le fond du rituel et la scène. */
export const RevealLayerContext = createContext<HTMLElement | null>(null);

/** Images de fumée du brouillard noir, à charger avant que la carte soit touchée. */
export const SCENE_ASSETS: Partial<Record<RevealSceneKey, readonly string[]>> = { BR: ["/fx/ring.webp", "/fx/puff.webp", "/fx/smoke.webp"] };

export const XR_ECHOES = ["#ff67ba", "#78bfff", "#63ffba"] as const;

const HOLO = ["#ff67ba", "#78bfff", "#63ffba", "#ffe881", "#ffffff"] as const;
const JEWELS = ["#ee2f4c", "#3f7bff", "#ffc52e", "#22c98e", "#a44bff", "#ff8a2a", "#23c4ea"] as const;
const v = (vars: Record<string, string | number>) => vars as CSSProperties;
const round = (n: number) => Math.round(n * 10) / 10;
const count = (n: number) => Array.from({ length: n }, (_, i) => i);

/** Carte à l'écran, mesurée au début de la charge. */
export type SceneBox = { cx: number; cy: number; cw: number; ch: number };

/* ---------- BR ---------- */
const BR_RINGS = [[0, 0, 70, 130], [160, 120, 40, 200], [320, 240, 300, 240]] as const;

function BrOver({ lite }: { lite: boolean }) {
  const { puffs, wisps } = useMemo(() => {
    const r = seeded(77), total = lite ? 5 : 10;
    return {
      puffs: count(total).map((i) => {
        const a = (i / total) * 6.283 + r() * 0.4, far = 62 + r() * 22, near = 6 + r() * 10;
        return v({ "--x0": `${round(Math.cos(a) * far)}vmax`, "--y0": `${round(Math.sin(a) * far)}vmax`, "--x1": `${round(Math.cos(a) * near)}vmax`, "--y1": `${round(Math.sin(a) * near)}vmax`, "--r": `${Math.round(r() * 80 - 40)}deg`, "--d": `${Math.round(120 + r() * 650)}ms`, "--t": `${Math.round(1100 + r() * 500)}ms` });
      }),
      wisps: count(lite ? 2 : 6).map((i) => v({ "--x": `${round(4 + (i / 5) * 70 + r() * 6)}%`, "--w": `${Math.round(22 + r() * 18)}vmin`, "--d": `${Math.round(2280 + r() * 800)}ms`, "--t": `${Math.round(1700 + r() * 800)}ms`, "--r": `${Math.round(r() * 14 - 7)}deg` })),
    };
  }, [lite]);
  return <>
    {BR_RINGS.slice(0, lite ? 2 : 3).map(([d, r0, r1, r2]) => (
      <div key={d} className="rv-at-center rv-fog-ring" style={v({ "--d": `${d}ms`, "--r0": `${r0}deg`, "--r1": `${r0 + r1}deg`, "--r2": `${r0 + r1 + r2 * 0.25}deg` })} />
    ))}
    {puffs.map((style, i) => <div key={i} className="rv-at-center rv-puff" style={style} />)}
    <div className="rv-at-center rv-fog-core" />
    {wisps.map((style, i) => <div key={i} className="rv-wisp" style={style} />)}
    <div className="rv-fog-floor" />
  </>;
}

/* ---------- MR ---------- */
function MangaWord() {
  const strokes = mangaStrokes();
  return (
    <svg className="rv-mr-word" viewBox="0 0 1010 400" preserveAspectRatio="none">
      <defs>
        {strokes.map((s) => (
          <mask key={s.id} id={s.id} maskUnits="userSpaceOnUse" x="-40" y="-40" width="1090" height="480">
            <path className="rv-write" pathLength={1} d={s.center} strokeWidth={s.revealWidth} style={v({ "--d": `${s.at}ms`, "--t": `${s.duration}ms` })} />
          </mask>
        ))}
      </defs>
      {/* Contour de papier, puis encre : le mot reste lisible par-dessus la carte */}
      <g fill="#f7f3ea" stroke="#f7f3ea" strokeWidth={16} strokeLinejoin="round">
        {strokes.map((s) => <path key={s.id} mask={`url(#${s.id})`} d={s.body} />)}
      </g>
      <g fill="#0f0d0b">
        {strokes.map((s) => <path key={s.id} mask={`url(#${s.id})`} d={s.body} />)}
        {strokes.flatMap((s) => s.drops.map((drop, i) => <circle key={`${s.id}-${i}`} className="rv-drop" cx={drop.cx} cy={drop.cy} r={drop.r} style={v({ "--d": `${drop.at}ms` })} />))}
      </g>
      <g fill="#f7f3ea">
        {strokes.flatMap((s) => s.dry.map((d, i) => <path key={`${s.id}-${i}`} mask={`url(#${s.id})`} d={d} />))}
      </g>
    </svg>
  );
}

/* ---------- VR ---------- */
const VR_RAYS = [
  { a: 13, tilt: 0, c: "rgb(255 244 214 / .3)", core: "rgb(255 250 235 / .62)", t: 5.5 },
  { a: 6.5, tilt: -1, c: "rgb(255 250 235 / .4)", core: "rgb(255 255 250 / .85)", t: 4.2 },
  { a: 4.5, tilt: -9, c: "rgb(190 160 255 / .26)", core: "rgb(214 188 255 / .55)", t: 6.3 },
  { a: 4.5, tilt: 9, c: "rgb(255 216 130 / .26)", core: "rgb(255 226 150 / .55)", t: 5.1 },
  { a: 3.2, tilt: 4.5, c: "rgb(160 200 255 / .2)", core: "rgb(190 220 255 / .46)", t: 7 },
] as const;

function Rosace() {
  const { glass, lead, rings } = useMemo(() => {
    const r = seeded(99), rings = [[56, 16], [65, 22], [75, 28], [86, 34], [99, 40]] as const;
    const at = (radius: number, a: number) => `${round(Math.cos(a) * radius)} ${round(Math.sin(a) * radius)}`;
    const glass: { d: string; fill: string }[] = [];
    let lead = "";
    rings.slice(0, -1).forEach(([inner, n], i) => {
      const outer = rings[i + 1][0], start = r() * 3;
      for (let k = 0; k < n; k++) {
        const a0 = start + (k / n) * 6.2832, a1 = start + ((k + 1) / n) * 6.2832;
        glass.push({ d: `M${at(inner, a0)}L${at(inner, a1)}L${at(outer, a1)}L${at(outer, a0)}Z`, fill: JEWELS[Math.floor(r() * JEWELS.length)] });
        lead += `M${at(inner, a0)}L${at(outer, a0)}`;
      }
    });
    return { glass, lead, rings };
  }, []);
  return (
    <svg viewBox="-100 -100 200 200">
      <g opacity={0.78}>{glass.map((p, i) => <path key={i} d={p.d} fill={p.fill} />)}</g>
      <g fill="none" stroke="#f6d98a" strokeWidth={0.8}>
        <path d={lead} />
        {rings.map(([radius]) => <circle key={radius} r={radius} />)}
      </g>
    </svg>
  );
}

function VrOver({ lite }: { lite: boolean }) {
  const { motes, shards } = useMemo(() => {
    const r = seeded(31);
    return {
      motes: count(lite ? 12 : 30).map(() => v({ "--x": `${round(26 + r() * 48)}%`, "--s": `${round(2 + r() * 5)}px`, "--dx": `${Math.round((r() - 0.5) * 90)}px`, "--d": `${Math.round(350 + r() * 3300)}ms`, "--t": `${Math.round(2300 + r() * 1500)}ms`, "--r": "0deg" })),
      shards: count(lite ? 4 : 12).map(() => v({ "--x": `${round(24 + r() * 52)}%`, "--s": `${round(6 + r() * 9)}px`, "--c": JEWELS[Math.floor(r() * JEWELS.length)], "--dx": `${Math.round((r() - 0.5) * 120)}px`, "--d": `${Math.round(700 + r() * 3000)}ms`, "--t": `${Math.round(2600 + r() * 1600)}ms`, "--r": `${Math.round(180 + r() * 540)}deg` })),
    };
  }, [lite]);
  return <>
    <div className="rv-vr-veil" />
    {motes.map((style, i) => <div key={i} className="rv-vr-mote" style={style} />)}
    {shards.map((style, i) => <div key={i} className="rv-vr-mote rv-vr-glass" style={style} />)}
    <div className="rv-vr-flash" />
  </>;
}

/* ---------- XR ---------- */
const XR_CRACKS = [["M50 70L44 52L50 40L42 22L46 0", 60], ["M50 70L60 58L56 40L68 26L66 0", 150], ["M50 70L34 74L22 64L10 70L0 62", 260], ["M50 70L66 78L78 70L90 80L100 74", 350], ["M50 70L42 90L50 108L42 124L46 140", 470], ["M50 70L58 92L54 110L64 128L60 140", 560], ["M44 52L30 44L18 30L8 24", 660], ["M60 58L74 50L84 36L96 30", 730], ["M42 90L28 98L16 114L6 120", 800], ["M58 92L72 100L84 116L94 124", 860]] as const;

function XrUnder({ lite, seal }: { lite: boolean; seal: string }) {
  const streaks = useMemo(() => {
    const r = seeded(2026);
    return count(lite ? 14 : 30).map(() => v({ "--a": `${Math.round(r() * 360)}deg`, "--c": HOLO[Math.floor(r() * HOLO.length)], "--t": `${Math.round(380 + r() * 420)}ms`, "--d": `${Math.round(1440 + r() * 600)}ms` }));
  }, [lite]);
  return <div className="rv-world rv-xr-shake">
    <div className="rv-xr-void" />
    <div className="rv-at-center rv-xr-leak" />
    <div className="rv-xr-tunnel">
      {count(lite ? 2 : 3).map((i) => <div key={i} className="rv-at-center rv-xr-tun" style={v({ "--d": `${1440 + i * 300}ms`, "--r": `${i * 37}deg` })} />)}
      {streaks.map((style, i) => <div key={i} className="rv-xr-streak" style={style} />)}
      <div className="rv-at-center rv-xr-core" />
    </div>
    <div className="rv-xr-after" />
    <div className="rv-at-center rv-xr-rays" />
    <div lang="ja" className="rv-xr-kanji font-seal">{seal}</div>
  </div>;
}

function XrOver({ lite, box }: { lite: boolean; box: SceneBox }) {
  const { geometry, burst, rain } = useMemo(() => {
    const r = seeded(11);
    return {
      geometry: xrGeometry(window.innerWidth, window.innerHeight, box.cx, box.cy),
      burst: count(lite ? 16 : 36).map(() => {
        const a = r() * 6.283, far = 22 + r() * 62;
        return v({ "--dx": `${round(Math.cos(a) * far)}vmax`, "--dy": `${round(Math.sin(a) * far)}vmax`, "--r": `${Math.round(180 + r() * 720)}deg`, "--s": `${round(5 + r() * 15)}px`, "--c": HOLO[Math.floor(r() * HOLO.length)], "--d": `${Math.round(2790 + r() * 90)}ms`, "--t": `${Math.round(800 + r() * 800)}ms` });
      }),
      rain: count(lite ? 12 : 34).map(() => v({ "--x": `${round(r() * 100)}%`, "--s": `${round(3 + r() * 6)}px`, "--c": HOLO[Math.floor(r() * HOLO.length)], "--dx": `${Math.round((r() - 0.5) * 90)}px`, "--d": `${Math.round(3000 + r() * 2100)}ms`, "--t": `${Math.round(1900 + r() * 1300)}ms`, "--r": `${Math.round(180 + r() * 720)}deg` })),
    };
  }, [lite, box]);
  return <div className="rv-world rv-xr-shake">
    <div className="rv-at-card rv-xr-cracks">
      <svg viewBox="0 0 100 140" preserveAspectRatio="none">
        <defs>
          <linearGradient id="rv-xr-holo" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ff67ba" /><stop offset=".35" stopColor="#78bfff" /><stop offset=".65" stopColor="#63ffba" /><stop offset="1" stopColor="#ffe881" />
          </linearGradient>
        </defs>
        {XR_CRACKS.map(([d, at]) => <path key={d} className="rv-xr-crack" d={d} style={v({ "--d": `${at}ms` })} />)}
      </svg>
    </div>
    {/* La scène découpée le long du X : ces triangles s'écartent et découvrent le tunnel */}
    {geometry.panes.map((pane) => (
      <div key={pane.clip} className="rv-xr-pane" style={v({ "--cp": pane.clip, "--tx": `${pane.tx}px`, "--ty": `${pane.ty}px`, "--ro": `${pane.rotate}deg` })}>
        <div className="rv-at-card"><CardBack flat premium /></div>
      </div>
    ))}
    {[2790, 2880, 3000].map((at) => <div key={at} className="rv-at-center rv-xr-wave" style={v({ "--d": `${at}ms` })} />)}
    {burst.map((style, i) => <div key={i} className="rv-xr-shard" style={style} />)}
    {rain.map((style, i) => <div key={i} className="rv-xr-rain" style={style} />)}
    <div className="rv-xr-slash" style={v({ "--a": `${geometry.angle}deg` })}><i style={v({ "--d": "1000ms", "--o": "0%" })} /></div>
    <div className="rv-xr-slash" style={v({ "--a": `${-geometry.angle}deg` })}><i style={v({ "--d": "1250ms", "--o": "100%" })} /></div>
    <div className="rv-xr-flash" />
  </div>;
}

/**
 * Mise en scène plein écran d'une carte qui se révèle : montée au début de la charge, elle se joue d'une traite
 * et reste jusqu'à ce que la carte quitte la pile.
 */
export function RevealScene({ scene, box, lite, seal }: { scene: RevealSceneKey; box: SceneBox; lite: boolean; seal: string }) {
  const under = useContext(RevealLayerContext);
  const present = useIsPresent();

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.revealScene = scene;
    root.style.setProperty("--rv-total", `${REVEAL_SCENES[scene].total}ms`);
    return () => {
      delete root.dataset.revealScene;
      root.style.removeProperty("--rv-total");
    };
  }, [scene]);

  const layer = {
    "aria-hidden": true,
    "data-lite": lite || undefined,
    "data-leaving": present ? undefined : true,
    style: v({
      "--cx": `${box.cx}px`, "--cy": `${box.cy}px`, "--cw": `${box.cw}px`, "--ch": `${box.ch}px`,
      "--rv-ring": "url(/fx/ring.webp)", "--rv-puff": "url(/fx/puff.webp)", "--rv-smoke": "url(/fx/smoke.webp)",
    }),
  };
  return <>
    {under && createPortal(
      <div className="rv-layer" {...layer}>
        {scene === "BR" && <>
          <div className="rv-br-dim" />
          <div className="rv-at-center rv-br-light" />
          <div className="rv-at-center rv-br-ember" />
        </>}
        {scene === "MR" && <>
          <div className="rv-mr-page"><div className="rv-mr-tone" /></div>
          <div className="rv-at-center rv-mr-lines" />
        </>}
        {scene === "VR" && <>
          <div className="rv-vr-sky" />
          <div className="rv-vr-fall">
            {VR_RAYS.slice(0, lite ? 3 : 5).map((ray) => <div key={`${ray.a}-${ray.tilt}`} className="rv-vr-ray" style={v({ "--a": `${ray.a}deg`, "--tilt": `${ray.tilt}deg`, "--c": ray.c, "--core": ray.core, "--t": `${ray.t}s` })} />)}
          </div>
          <div className="rv-vr-crown" />
          <div className="rv-at-center rv-vr-glow" />
          <div className="rv-at-center rv-vr-rose"><Rosace /></div>
        </>}
        {scene === "XR" && <XrUnder lite={lite} seal={seal} />}
      </div>,
      under,
    )}
    {createPortal(
      <div className="rv-layer rv-over" {...layer}>
        {scene === "BR" && <BrOver lite={lite} />}
        {scene === "MR" && <>
          <MangaWord />
          {/* Onomatopée de case d'impact, comme en combat : décor, jamais lu */}
          <div lang="ja" className="rv-mr-don font-seal">ドン</div>
        </>}
        {scene === "VR" && <VrOver lite={lite} />}
        {scene === "XR" && <XrOver lite={lite} box={box} />}
      </div>,
      document.body,
    )}
    {scene === "MR" && createPortal(<div aria-hidden="true" className="rv-mr-neg" />, document.body)}
  </>;
}
