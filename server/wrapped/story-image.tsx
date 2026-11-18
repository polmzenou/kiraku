import "server-only";
import { ImageResponse } from "next/og";
import type { ReactNode } from "react";
import type { WrappedSummary } from "@/lib/wrapped/summary";
import type { OgFont } from "../og/assets";
import { FONT, OG, OgFuda, Wordmark } from "../og/scene";

// Image story du Wrapped (1080 × 1920), palette Yoru : l'année d'un joueur en une image à partager
// (Instagram, TikTok, Discord). Satori : chaque bloc à plusieurs enfants est en flex.

export const STORY_SIZE = { width: 1080, height: 1920 } as const;

/** Textes déjà traduits et formatés dans la langue du joueur (la route les prépare). */
export type StoryLabels = {
  kicker: string;
  title: string;
  stats: { label: string; value: string }[];
  bestPull: string;
  favorite: string;
  footer: string;
};

export type StoryAssets = {
  fonts: OgFont[];
  seal: string;
  /** Illustrations en data URI (null : hôte inconnu, carte spoil ou image indisponible). */
  bestPullImage: string | null;
  favoriteImage: string | null;
};

/** Taille du chiffre d'une case : une seule ligne même pour un rang long (« Grand Champion », « Champion I »). */
export const statSize = (value: string) => (value.length <= 7 ? 64 : value.length <= 10 ? 50 : value.length <= 14 ? 38 : 30);

function Panel({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", borderRadius: 36, background: "rgba(34,29,24,0.86)", border: `2px solid ${OG.border}`, ...style }}>
      {children}
    </div>
  );
}

/** Une carte mise en avant : fuda (ou sceau si l'illustration est absente ou spoil), légende au-dessus. */
function Highlight({ caption, card, image, seal }: { caption: string; card: { name: string; rarity: string; frame: string }; image: string | null; seal: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 22, width: 440 }}>
      <div style={{ display: "flex", color: OG.kin, fontSize: 30, fontWeight: 700, letterSpacing: 5, textTransform: "uppercase" }}>{caption}</div>
      <div style={{ display: "flex", position: "relative", width: 380, height: 532 }}>
        <OgFuda card={{ name: card.name, rarity: card.rarity, frame: card.frame, image: image ?? seal }} width={380} style={{ left: 0, top: 0 }} />
      </div>
    </div>
  );
}

export function renderWrappedStory(summary: WrappedSummary, labels: StoryLabels, assets: StoryAssets, headers?: Record<string, string>): ImageResponse {
  const { seal } = assets;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", position: "relative", background: OG.bg, color: OG.text, fontFamily: FONT.body }}>
        {/* Halos kin et shu, filigrane 年, liseré shu en bas */}
        <div style={{ position: "absolute", inset: 0, display: "flex", backgroundImage: "radial-gradient(circle at 80% 12%, rgba(217,181,86,0.24), transparent 42%)" }} />
        <div style={{ position: "absolute", inset: 0, display: "flex", backgroundImage: "radial-gradient(circle at 10% 92%, rgba(200,55,45,0.32), transparent 45%)" }} />
        <div style={{ position: "absolute", top: 120, right: -40, display: "flex", fontFamily: FONT.seal, fontSize: 760, lineHeight: 1, color: OG.kin, opacity: 0.08 }}>年</div>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 18, display: "flex", background: OG.shuButton }} />
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 18, height: 3, display: "flex", background: OG.kin, opacity: 0.6 }} />

        <div style={{ display: "flex", flexDirection: "column", gap: 56, padding: "96px 84px 0", width: "100%" }}>
          <Wordmark seal={seal} size={76} />
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", color: OG.kin, fontSize: 34, fontWeight: 700, letterSpacing: 8, textTransform: "uppercase" }}>{labels.kicker}</div>
            <div style={{ display: "flex", fontFamily: FONT.heading, fontSize: 92, lineHeight: 1.05 }}>{labels.title}</div>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 28 }}>
            {labels.stats.slice(0, 4).map((s) => (
              <Panel key={s.label} style={{ width: 442, padding: "34px 36px", gap: 8 }}>
                <div style={{ display: "flex", color: OG.muted, fontSize: 30 }}>{s.label}</div>
                <div style={{ display: "flex", fontFamily: FONT.heading, fontSize: statSize(s.value), whiteSpace: "nowrap", color: OG.text }}>{s.value}</div>
              </Panel>
            ))}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between" }}>
            {summary.bestPull && <Highlight caption={labels.bestPull} card={summary.bestPull} image={assets.bestPullImage} seal={seal} />}
            {summary.favorite && <Highlight caption={labels.favorite} card={summary.favorite} image={assets.favoriteImage} seal={seal} />}
          </div>
        </div>

        <div style={{ position: "absolute", left: 0, right: 0, bottom: 70, display: "flex", justifyContent: "center", color: OG.muted, fontSize: 34, letterSpacing: 2 }}>
          {labels.footer}
        </div>
      </div>
    ),
    { ...STORY_SIZE, fonts: assets.fonts, ...(headers && { headers }) },
  );
}
