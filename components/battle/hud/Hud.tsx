"use client";

import { useTranslations } from "next-intl";
import { useId, type ReactNode } from "react";
import { RankEmblem } from "@/components/ranked/RankEmblem";
import { PlayerAvatar } from "@/components/social/PlayerAvatar";
import { useSecondsLeft } from "../TurnTimer";
import { PlayerName } from "@/components/social/PlayerName";
import { ACTION_KANJI } from "@/lib/battle/glyphs";
import type { BoardTier } from "@/lib/battle/tiers";
import type { Side, Technique } from "@/lib/battle/types";
import type { PlayerView } from "@/lib/battle/view";
import { usePlayerName } from "../BoardLayout";
import { BotMask } from "./BotMask";

/** Orbes 気 en magatama : pleins jusqu'au nombre de ce tour. `data-orbs` sert de départ aux orbes qui volent. */
export function KiOrbs({ count, max, side, label }: { count: number; max: number; side: Side; label: string }) {
  const id = useId();
  return (
    <span className="ki-orbs" role="img" aria-label={label} data-orbs={side}>
      <svg aria-hidden="true" width="0" height="0" className="absolute">
        <defs>
          <radialGradient id={`${id}-on`} cx="40%" cy="35%" r="70%">
            <stop offset="0" stopColor="#fff6dc" />
            <stop offset=".45" stopColor="#f2d88a" />
            <stop offset="1" stopColor="#9c7826" />
          </radialGradient>
        </defs>
      </svg>
      {Array.from({ length: Math.max(max, count) }, (_, i) => (
        <svg key={i} aria-hidden="true" viewBox="0 0 24 24" className="ki-orb" data-on={i < count || undefined}>
          <path
            d="M13.5 2.2a7.3 7.3 0 0 1 .4 14.6c-2.6.2-4.2 1.6-4.9 3.6-.4 1.1-1 1.9-2.3 1.6C4.6 21.6 3.4 19 3.6 16.4 4.1 8.6 7.9 1.9 13.5 2.2z"
            fill={i < count ? `url(#${id}-on)` : "#1a1511"}
            stroke={i < count ? "#fff2c2" : "#5a4d3c"}
            strokeWidth="1.2"
          />
          <circle cx="13.6" cy="9.2" r="2.3" fill={i < count ? "#7a5418" : "#2a231c"} />
        </svg>
      ))}
    </span>
  );
}

/** Minuteur du tour : un bâton d'encens qui se consume ; la braise rougit dans les 10 dernières secondes. */
export function Incense({ endsAt, total }: { endsAt: string | null; total: number }) {
  const t = useTranslations("battle.board");
  // Seul l'encens se re-rend quatre fois par seconde, pas toute la scène
  const secondsLeft = useSecondsLeft(endsAt, 0);
  if (secondsLeft === null) return <span className="incense" aria-hidden="true" data-idle />;
  const left = Math.max(0, Math.min(1, secondsLeft / Math.max(1, total)));
  const seconds = Math.ceil(secondsLeft);
  return (
    <span className="incense" role="timer" aria-label={t("timer", { seconds })} data-urgent={secondsLeft <= 10 || undefined}>
      <span aria-hidden="true" className="incense-stick">
        <span className="incense-left" style={{ transform: `scaleX(${left})` }} />
      </span>
      <span aria-hidden="true" className="incense-front" style={{ transform: `translateX(${left * 100}%)` }}>
        <span className="incense-ember" />
        <span className="incense-smoke">
          <i />
          <i />
          <i />
        </span>
      </span>
      <span aria-hidden="true" className="incense-count">
        {seconds}
      </span>
    </span>
  );
}

/**
 * Bannière d'un joueur : avatar dans son cadre (masque pour un bot), pseudo dans sa couleur, emblème du
 * rang, un témoin par carte encore debout, et les orbes du tour quand c'est à lui de jouer.
 */
export function PlayerBanner({
  player,
  place,
  active,
  standing,
  tier,
  children,
}: {
  player: PlayerView | null;
  place: "top" | "bottom";
  active: boolean;
  standing: number;
  tier: BoardTier | null;
  children?: ReactNode;
}) {
  const t = useTranslations("battle.board");
  const name = usePlayerName();
  const human = player && "username" in player ? player : null;
  return (
    <div className="player-banner" data-place={place} data-active={active || undefined}>
      <span className="player-avatar">
        {human ? <PlayerAvatar username={human.username} image={human.image} size={40} frame={human.decor.frame} /> : <BotMask bot={player && "bot" in player ? player.bot : null} size={40} />}
      </span>
      <span className="player-id">
        <PlayerName name={name(player)} color={human?.decor.nameColor} className="player-name" />
        <span className="player-standing" role="img" aria-label={t("standing", { count: standing })}>
          {[0, 1, 2].map((i) => (
            <i key={i} data-on={i < standing || undefined} />
          ))}
        </span>
      </span>
      {tier && <RankEmblem tier={tier} size={30} className="player-emblem" />}
      <span className="player-extra">{children}</span>
    </div>
  );
}

/** Tablettes d'action laquées : attaquer, la technique de la carte choisie et son coût, finir le tour. */
export function Tablets({
  mode,
  attack,
  technique,
  end,
}: {
  mode: "ATTACK" | "TECHNIQUE";
  attack: { enabled: boolean; onPress: () => void };
  technique: { technique: Technique | null; cost: number; enabled: boolean; onPress: () => void };
  end: { enabled: boolean; pulse: boolean; onPress: () => void };
}) {
  const t = useTranslations("battle");
  const tech = technique.technique;
  return (
    <div className="tablets">
      <button type="button" className="tablet" data-active={(mode === "ATTACK" && attack.enabled) || undefined} disabled={!attack.enabled} onClick={attack.onPress}>
        <span aria-hidden="true" className="tablet-kanji">
          {ACTION_KANJI.attack}
        </span>
        <span className="tablet-label">{t("board.attack")}</span>
      </button>
      <button type="button" className="tablet tablet-tech" data-active={(mode === "TECHNIQUE" && technique.enabled) || undefined} disabled={!technique.enabled} onClick={technique.onPress}>
        <span aria-hidden="true" className="tablet-kanji">
          {ACTION_KANJI.technique}
        </span>
        <span className="tablet-label">
          {tech ? t(`techniques.${tech}.name`) : t("board.techniqueLabel")}
          {tech && (
            <span className="tablet-cost" role="img" aria-label={t("board.orbs", { count: technique.cost })}>
              {Array.from({ length: technique.cost }, (_, i) => (
                <i key={i} />
              ))}
            </span>
          )}
        </span>
      </button>
      <button type="button" className="tablet tablet-end" data-pulse={(end.enabled && end.pulse) || undefined} disabled={!end.enabled} onClick={end.onPress}>
        <span aria-hidden="true" className="tablet-kanji">
          {ACTION_KANJI.end}
        </span>
        <span className="tablet-label">{t("board.endTurn")}</span>
      </button>
    </div>
  );
}

/** Fil des actions : la dernière phrase du journal, lue par les lecteurs d'écran à toutes les tailles. */
export function Ticker({ text, tone }: { text: string | null; tone: "mine" | "theirs" | "error" | "hint" }) {
  return (
    <p className="ticker" data-tone={tone} aria-live="polite">
      {text}
    </p>
  );
}
