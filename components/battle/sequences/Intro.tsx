"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { RankEmblem } from "@/components/ranked/RankEmblem";
import { PlayerAvatar } from "@/components/social/PlayerAvatar";
import { PlayerName } from "@/components/social/PlayerName";
import { ARENA_KANJI, type ArenaId } from "@/lib/battle/arenas";
import type { FxLevel } from "@/lib/battle/choreography";
import type { BoardTier } from "@/lib/battle/tiers";
import type { Side } from "@/lib/battle/types";
import type { PlayerView } from "@/lib/battle/view";
import { usePlayerName } from "../BoardLayout";
import { BotMask } from "../hud/BotMask";
import type { SoundPort } from "../stage/useDirector";
import "./sequences.css";

type Phase = "title" | "versus" | "reveal" | "deal" | "first" | "done";

function Fighter({ player, tier, place }: { player: PlayerView | null; tier: BoardTier | null; place: "mine" | "theirs" }) {
  const name = usePlayerName();
  const human = player && "username" in player ? player : null;
  return (
    <div className="intro-player" data-place={place}>
      {human ? <PlayerAvatar username={human.username} image={human.image} size={64} frame={human.decor.frame} /> : <BotMask bot={player && "bot" in player ? player.bot : null} size={64} />}
      <span className="intro-player-id">
        <PlayerName name={name(player)} color={human?.decor.nameColor} className="intro-player-name" />
        {tier && <RankEmblem tier={tier} size={34} />}
      </span>
    </div>
  );
}

/**
 * Entrée en arène (environ 3,5 s, passable d'un toucher) : le nom de l'arène au pinceau, les deux
 * bannières et le sceau 対, les shoji qui s'ouvrent sur l'arène, la distribution des cartes, puis qui
 * commence. Rien qu'un fondu en mouvement réduit.
 */
export function Intro({
  arena,
  players,
  mySide,
  tiers,
  first,
  level,
  deal,
  finishDeal,
  onDone,
  sound,
}: {
  arena: ArenaId;
  players: [PlayerView, PlayerView | null];
  mySide: Side;
  tiers: [BoardTier | null, BoardTier | null];
  first: Side;
  level: FxLevel;
  deal: () => Promise<void>;
  finishDeal: () => void;
  onDone: () => void;
  sound?: { current: SoundPort | null };
}) {
  const t = useTranslations("battle");
  const name = usePlayerName();
  const [phase, setPhase] = useState<Phase>(level === "reduced" ? "done" : "title");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const ended = useRef(false);
  const opp = (mySide === 0 ? 1 : 0) as Side;

  const end = () => {
    if (ended.current) return;
    ended.current = true;
    timers.current.forEach(clearTimeout);
    finishDeal();
    setPhase("done");
    onDone();
  };

  useEffect(() => {
    if (level === "reduced") {
      end();
      return;
    }
    const at = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms));
    at(1_050, () => setPhase("versus"));
    at(1_500, () => sound?.current?.play("drum"));
    at(1_560, () => sound?.current?.play("clack"));
    at(2_300, () => {
      setPhase("reveal");
      sound?.current?.play("swing");
    });
    at(2_750, () => {
      setPhase("deal");
      void deal().then(() => {
        if (ended.current) return;
        setPhase("first");
        sound?.current?.play("clack");
        at(1_050, end);
      });
    });
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
    // L'entrée ne se joue qu'une fois, au montage
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase === "done") return null;
  return (
    <div className="intro" data-phase={phase} onPointerDown={end}>
      <span className="intro-shoji intro-shoji-l" aria-hidden="true" />
      <span className="intro-shoji intro-shoji-r" aria-hidden="true" />
      <div className="intro-title">
        <span className="intro-kanji" lang="ja" aria-hidden="true">
          {ARENA_KANJI[arena]}
        </span>
        <span className="intro-name">{t(`arena.${arena}`)}</span>
      </div>
      <div className="intro-vs" aria-hidden={phase === "title" || undefined}>
        <Fighter player={players[opp]} tier={tiers[opp]} place="theirs" />
        <span className="intro-taisen" lang="ja" aria-hidden="true">
          対
        </span>
        <Fighter player={players[mySide]} tier={tiers[mySide]} place="mine" />
      </div>
      {phase === "first" && (
        <p className="intro-first" aria-live="polite">
          {first === mySide ? t("entrance.youFirst") : t("entrance.theyFirst", { name: name(players[first]) })}
        </p>
      )}
      <span className="intro-skip">{t("entrance.skip")}</span>
    </div>
  );
}
