/* eslint-disable @next/next/no-img-element -- rendu Satori (next/og), pas du DOM */
import "server-only";
import type { CSSProperties, ReactNode } from "react";
import { conicRingSvg, parseConic } from "@/lib/og/conic";
import { RARITY_SEAL } from "@/lib/catalog/rarity";
import { FRAME_KANJI, FRAME_RING, type FrameStyle } from "@/lib/profile/frames";
import { NAME_COLOR_GRADIENT, type NameColorStyle } from "@/lib/profile/name-colors";
import type { OgCard } from "./data";

// Briques des images de partage (1200 × 630), palette Yoru. Satori : chaque bloc à plusieurs enfants
// est en flex, pas de conic-gradient (anneaux en SVG), pas de WebP.

export const OG = {
  bg: "#15120F",
  surface: "#221D18",
  surface2: "#2B251F",
  border: "#3A322A",
  text: "#F1E9DA",
  muted: "#A89F92",
  shu: "#E0533F",
  shuButton: "#C8372D",
  kin: "#D9B556",
  washi: "#F3ECDF",
  sumi: "#1F1B17",
} as const;

export const FONT = {
  heading: "Dela Gothic One",
  title: "Shippori Mincho B1",
  body: "Zen Kaku Gothic New",
  seal: "Yuji Syuku",
} as const;

const svgUri = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

/** Seigaiha (vagues) en filets kin : rangées d'écailles de bas en haut de l'image. */
function seigaihaSvg(width: number, height: number, r: number): string {
  const scales: string[] = [];
  for (let row = 0, y = 0; y <= height + r; row++, y = (row * r) / 2) {
    for (let x = row % 2 ? r : 0; x <= width + r; x += 2 * r) {
      scales.push(
        `<circle cx="${x}" cy="${y}" r="${r}" fill="${OG.bg}"/>` +
          [1, 0.74, 0.48, 0.22].map((k) => `<circle cx="${x}" cy="${y}" r="${r * k}" fill="none" stroke="${OG.kin}" stroke-width="1.6"/>`).join(""),
      );
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${scales.join("")}</svg>`;
}

let pattern: string | null = null;

/** Fond commun : nuit Yoru, vagues seigaiha estompées vers la gauche, halos shu et kin, liseré shu en bas. */
export function Backdrop({ children }: { children: ReactNode }) {
  pattern ??= svgUri(seigaihaSvg(1200, 630, 44));
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: OG.bg, color: OG.text, fontFamily: FONT.body }}>
      <img src={pattern} width={1200} height={630} alt="" style={{ position: "absolute", top: 0, left: 0, opacity: 0.11 }} />
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          display: "flex",
          backgroundImage: `linear-gradient(90deg, ${OG.bg} 0%, rgba(21,18,15,0.94) 38%, rgba(21,18,15,0.35) 72%, rgba(21,18,15,0.6) 100%)`,
        }}
      />
      <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", display: "flex", backgroundImage: "radial-gradient(circle at 82% 30%, rgba(217,181,86,0.20), transparent 46%)" }} />
      <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", display: "flex", backgroundImage: "radial-gradient(circle at 6% 104%, rgba(200,55,45,0.32), transparent 42%)" }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 12, display: "flex", background: OG.shuButton }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 12, height: 2, display: "flex", background: OG.kin, opacity: 0.6 }} />
      {children}
    </div>
  );
}

/** Sceau 気楽 et nom Kiraku. */
export function Wordmark({ seal, size }: { seal: string; size: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: size * 0.32 }}>
      <img src={seal} width={size} height={size} alt="" style={{ borderRadius: size * 0.18, boxShadow: "0 10px 30px rgba(0,0,0,0.45)" }} />
      <div style={{ display: "flex", fontFamily: FONT.title, fontWeight: 800, fontSize: size * 0.78, letterSpacing: -1, lineHeight: 1 }}>Kiraku</div>
    </div>
  );
}

/** Matière du cadre d'une fuda, comme sur le site (feuille d'or, nacre, laque). */
const MATERIAL: Record<string, string> = {
  LEGENDARY: "linear-gradient(140deg, #8a6a1f 0%, #f3dc8c 28%, #c8a140 52%, #f7e6a6 74%, #8a6a1f 100%)",
  MYTHIC: "linear-gradient(140deg, #d4a9c8 0%, #f6eef3 24%, #c9dfe0 48%, #efe3e6 70%, #b7a1d6 100%)",
  EPIC: "linear-gradient(140deg, #4a2d63 0%, #9872bc 34%, #d8c2ee 56%, #7a55a0 78%, #3b2350 100%)",
  RARE: "linear-gradient(140deg, #1e3557 0%, #557ca5 40%, #a9c2e2 60%, #2a4a78 100%)",
};

/** Fuda papier : cadre de rareté, illustration, sceau kanji, nom en Shippori. */
export function OgFuda({ card, width, style }: { card: OgCard; width: number; style?: CSSProperties }) {
  const height = Math.round(width * 1.4);
  const pad = Math.round(width / 30);
  return (
    <div
      style={{
        position: "absolute",
        width,
        height,
        display: "flex",
        padding: pad,
        borderRadius: width / 16,
        backgroundImage: MATERIAL[card.rarity] ?? MATERIAL.RARE,
        boxShadow: "0 24px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,0,0,0.4)",
        ...style,
      }}
    >
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", borderRadius: width / 24, background: OG.washi }}>
        <div style={{ flex: 1, display: "flex", position: "relative", overflow: "hidden", background: "#e4d9c4" }}>
          <img src={card.image} alt="" width={width - 2 * pad} height={height - 2 * pad - width * 0.17} style={{ objectFit: "cover", objectPosition: "50% 0%" }} />
          <div
            style={{
              position: "absolute",
              top: width * 0.04,
              left: width * 0.04,
              width: width * 0.16,
              height: width * 0.16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: width * 0.03,
              background: OG.shuButton,
              color: OG.washi,
              fontFamily: FONT.seal,
              fontSize: width * 0.11,
              boxShadow: "0 2px 6px rgba(0,0,0,0.35)",
            }}
          >
            {RARITY_SEAL[card.rarity] ?? "札"}
          </div>
        </div>
        <div
          style={{
            height: width * 0.17,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: `0 ${pad * 2}px`,
            color: OG.sumi,
            fontFamily: FONT.title,
            fontWeight: 800,
            fontSize: width * 0.075,
            borderTop: "1px solid #d9cfbc",
          }}
        >
          <span style={{ overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{card.name}</span>
        </div>
      </div>
    </div>
  );
}

/** Éventail de fuda (2 ou 3), la carte du milieu devant. */
export function FudaFan({ cards }: { cards: OgCard[] }) {
  const [left, middle, right] = cards.length >= 3 ? [cards[0], cards[1], cards[2]] : [cards[0], cards[1], undefined];
  return (
    <div style={{ position: "absolute", top: 0, right: 0, width: 520, height: 630, display: "flex" }}>
      {left && <OgFuda card={left} width={226} style={{ left: 22, top: 156, transform: "rotate(-11deg)" }} />}
      {right && <OgFuda card={right} width={226} style={{ left: 268, top: 156, transform: "rotate(11deg)" }} />}
      {middle && <OgFuda card={middle} width={262} style={{ left: 128, top: 92 }} />}
    </div>
  );
}

/** Avatar rond du joueur dans son cadre (anneau conique en SVG, sceau du cadre en bas), ou l'initiale sur papier. */
export function OgAvatar({ username, avatar, frame, size }: { username: string; avatar: string | null; frame: FrameStyle | null; size: number }) {
  const ring = Math.round(size / 15);
  const conic = frame ? parseConic(FRAME_RING[frame]) : null;
  const inner = conic ? size - 2 * ring - 4 : size;
  const face = avatar ? (
    <img src={avatar} alt="" width={inner} height={inner} style={{ borderRadius: inner / 2, objectFit: "cover" }} />
  ) : (
    <div
      style={{
        width: inner,
        height: inner,
        borderRadius: inner / 2,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: OG.surface2,
        border: `2px solid ${OG.border}`,
        color: OG.text,
        fontFamily: FONT.title,
        fontWeight: 800,
        fontSize: inner * 0.42,
      }}
    >
      {username.charAt(0).toUpperCase()}
    </div>
  );
  return (
    <div style={{ position: "relative", width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <div style={{ position: "absolute", top: -24, left: -24, width: size + 48, height: size + 48, display: "flex", borderRadius: size, backgroundImage: "radial-gradient(circle, rgba(217,181,86,0.28), transparent 68%)" }} />
      {conic ? (
        <img src={svgUri(conicRingSvg(conic, size, ring))} width={size} height={size} alt="" style={{ position: "absolute", top: 0, left: 0 }} />
      ) : (
        <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", display: "flex", borderRadius: size / 2, border: `${Math.round(ring / 2)}px solid ${OG.border}` }} />
      )}
      <div style={{ display: "flex", padding: 2, borderRadius: size / 2, background: OG.bg }}>{face}</div>
      {frame && (
        <div
          style={{
            position: "absolute",
            bottom: -size * 0.04,
            left: size / 2 - size * 0.09,
            width: size * 0.18,
            height: size * 0.18,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: size * 0.03,
            border: `2px solid ${OG.border}`,
            background: OG.surface,
            color: OG.shu,
            fontFamily: FONT.seal,
            fontSize: size * 0.11,
          }}
        >
          {FRAME_KANJI[frame]}
        </div>
      )}
    </div>
  );
}

/** Pseudo dans sa couleur (dégradé clippé au texte) ; sans couleur, le texte Yoru. */
export function OgName({ name, color, fontSize }: { name: string; color: NameColorStyle | null; fontSize: number }) {
  const paint: CSSProperties = color
    ? { backgroundImage: NAME_COLOR_GRADIENT[color], backgroundClip: "text", color: "transparent" }
    : { color: OG.text };
  return <div style={{ display: "flex", fontFamily: FONT.heading, fontSize, lineHeight: 1.1, letterSpacing: -1, ...paint }}>{name}</div>;
}

/** Pastille (chips de l'accueil, code d'invitation). */
export function Chip({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "kin" }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        flexShrink: 0,
        padding: "8px 20px",
        borderRadius: 999,
        border: `2px solid ${tone === "kin" ? "rgba(217,181,86,0.7)" : OG.border}`,
        background: tone === "kin" ? "rgba(217,181,86,0.12)" : "rgba(34,29,24,0.85)",
        color: tone === "kin" ? OG.kin : OG.text,
        fontSize: 24,
        fontWeight: 700,
      }}
    >
      {children}
    </div>
  );
}
