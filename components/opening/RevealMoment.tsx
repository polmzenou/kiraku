"use client";

import { useLocale, useTranslations } from "next-intl";
import type { CSSProperties } from "react";
import { rarityColor } from "@/lib/catalog/appearance";
import type { Rarity } from "@/lib/catalog/rarity";
import { isBigMoment } from "@/lib/catalog/tiers";
import { REVEAL_SCENES, revealSceneKey } from "@/lib/opening/reveal-scenes";
import { useRarityDefinitions } from "@/lib/catalog/use-rarities";
import { titleLines, titleSizeCqi, titleText } from "@/lib/opening/reveal-title";
import "./RevealFx.css";

// Grand moment des Légendaires et au-delà : le sceau de la rareté s'écrase en plein écran, son nom
// s'inscrit en capitales au-dessus de la carte puis s'envole, et le fond du rituel prend sa teinte.

export type Moment = { id: string; rarity: Rarity; color: string; seal: string; name: string };

const v = (vars: Record<string, string | number>) => vars as CSSProperties;
const secs = (n: number) => `${Math.round(n * 1000) / 1000}s`;

/** Apparition du nom : le sceau, puis une lettre toutes les 45 ms. */
const SEAL_IN = 0.85;
const LETTERS_IN = 0.95;
const LETTER_STEP = 0.045;
const LETTER_DURATION = 0.45;
/** Le nom reste entier à l'écran pendant ce temps (s), puis s'envole. */
const TITLE_HOLD = 2;
const OUT_STEP = 0.03;
const OUT_DURATION = 0.5;

/** Le nom est parti (s) : le compteur de cartes peut revenir à sa place. */
export const titleGone = (name: string) => {
  const n = Array.from(titleText(name)).length;
  return titleOut(n) + (n - 1) * OUT_STEP + OUT_DURATION;
};
const titleOut = (letters: number) => LETTERS_IN + (letters - 1) * LETTER_STEP + LETTER_DURATION + TITLE_HOLD;

/** Délai d'apparition de la teinte : quand le sceau s'est posé. */
export const TINT_DELAY = 0.25;

/** Le grand moment d'une carte à l'endroit, ou null si sa rareté n'en a pas. */
export function useMomentFor() {
  const definitions = useRarityDefinitions();
  const t = useTranslations("rarity");
  const locale = useLocale();
  return (id: string, rarity: Rarity): Moment | null => {
    if (!isBigMoment(rarity, definitions)) return null;
    const def = definitions.find((d) => d.key === rarity);
    const name = t.has(rarity) ? t(rarity) : (locale === "en" && def?.nameEn) || def?.nameFr || rarity;
    return { id, rarity, color: rarityColor(rarity, def?.appearance), seal: def?.seal ?? "", name };
  };
}

/** Fond teinté du grand moment, inondé depuis le centre (le calque lui-même vit dans RitualBackdrop). */
export function momentTint(color: string): CSSProperties {
  const tint = `color-mix(in srgb, ${color} 50%, transparent)`;
  const soft = `color-mix(in srgb, ${color} 22%, transparent)`;
  return { background: `radial-gradient(circle at 50% 45%, ${tint}, ${soft} 40%, transparent 75%)` };
}

/** Le sceau géant s'écrase au centre avec un éclair, puis s'envole vers le nom (ou dans le panneau d'aperçu avec `contained`). */
export function RevealOverlay({ moment, contained = false }: { moment: Moment; contained?: boolean }) {
  const key = contained ? null : revealSceneKey(moment.rarity);
  const scene = key ? REVEAL_SCENES[key] : null;
  // Les raretés visuelles règlent leur sceau sur leur propre mise en scène
  if (scene?.hanko === null) return null;
  const delay = scene ? `${scene.hanko}ms` : undefined;
  return (
    <div
      aria-hidden="true"
      className="moment-overlay"
      data-contained={contained || undefined}
      data-paper={scene?.paper || undefined}
      style={v({ "--moment": scene?.hankoColor ?? moment.color, ...(delay && { "--hanko-d": delay }) })}
    >
      {(!scene || scene.flash) && <span className="moment-flash" style={delay ? v({ "--d": delay }) : undefined} />}
      <span lang="ja" className="moment-hanko-stamp font-seal">
        {moment.seal}
      </span>
    </div>
  );
}

/**
 * Nom de la rareté en capitales au-dessus de la carte : il s'inscrit lettre à lettre, reste 2 s, puis s'envole.
 * Un nom long passe sur 2 ou 3 lignes, coupées entre les mots (lib/opening/reveal-title.ts).
 */
export function RevealTitle({ moment, scene = false }: { moment: Moment; scene?: boolean }) {
  const text = titleText(moment.name);
  const count = Array.from(text).length;
  const lines = titleLines(moment.name);
  const key = scene ? revealSceneKey(moment.rarity) : null;
  // Le nom suit le déroulé de la scène : il attend que le brouillard ou la page se retire
  const shift = key ? REVEAL_SCENES[key].title / 1000 - SEAL_IN : 0;
  const out = titleOut(count) + shift;
  // Une lettre garde son rang dans le nom entier : l'espace d'une coupure de ligne compte, le rythme ne change pas
  let index = 0;
  const letter = (ch: string) => {
    const i = index++;
    return (
      <span
        key={i}
        aria-hidden="true"
        className="moment-letter inline-block whitespace-pre"
        style={v({ "--d": secs(LETTERS_IN + shift + i * LETTER_STEP), "--o": secs(out + i * OUT_STEP) })}
      >
        {ch}
      </span>
    );
  };
  return (
    // La taille suit la largeur disponible (unités cqi) et la ligne la plus longue, jamais le seul écran
    <p className="@container flex w-full items-center justify-center gap-2" style={v({ "--moment": moment.color })}>
      <span
        aria-hidden="true"
        lang="ja"
        className="moment-title-seal moment-seal shrink-0 font-seal text-[clamp(1.125rem,8.5cqi,2.5rem)] leading-none"
        style={v({ "--d": secs(SEAL_IN + shift), "--o": secs(out + count * OUT_STEP) })}
      >
        {moment.seal}
      </span>
      <span
        data-chroma={key === "XR" || undefined}
        data-lines={lines.length > 1 ? lines.length : undefined}
        className="moment-title flex min-w-0 flex-col items-center gap-[0.14em] text-center font-title leading-none font-extrabold tracking-[0.06em]"
        style={{ fontSize: `clamp(0.875rem, ${titleSizeCqi(lines)}cqi, 3rem)` }}
      >
        <span className="sr-only">{moment.name}</span>
        {lines.map((line, l) => {
          const row = <span key={`line-${l}`} aria-hidden="true" className="block whitespace-nowrap">{Array.from(line).map(letter)}</span>;
          // L'espace avalé par la coupure garde son rang
          if (l < lines.length - 1) index++;
          return row;
        })}
      </span>
    </p>
  );
}
