"use client";

import { useTranslations } from "next-intl";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import type { ArenaId } from "@/lib/battle/arenas";
import type { FxLevel, Slot } from "@/lib/battle/choreography";
import type { BoardTier } from "@/lib/battle/tiers";
import type { BattleSetup, Side } from "@/lib/battle/types";
import type { PlayerView } from "@/lib/battle/view";
import { ArenaHost } from "../arenas/ArenaHost";
import { CutIn, TurnBanner } from "../fx/CutIn";
import { Incense, KiOrbs, PlayerBanner, Ticker } from "../hud/Hud";
import { usePlayerName } from "../BoardLayout";
import { StageCard } from "./StageCard";
import type { ArenaHandle, Director, StageNumber } from "./useDirector";
import "../fx/fx.css";
import "./stage.css";

export type RowProps = {
  selected?: number | null;
  targets?: ReadonlySet<number>;
  ready?: ReadonlySet<number>;
  onPress?: (index: number) => void;
};

const SLOTS: Slot[][] = [0, 1].map((side) => [0, 1, 2].map((index) => ({ side: side as Side, index })));
const NONE: StageNumber[] = [];
const SIZES = "(min-width: 1024px) 200px, 30vw";

/**
 * Scène du combat, plein écran : l'arène au fond, le plateau dans la caméra (adversaire au loin, soi au
 * premier plan, ligne de front et encens au milieu), l'interface en haut et en bas, et deux calques
 * d'effets (l'un suit la caméra, l'autre couvre l'écran). Partagée par le direct, le replay et le bac à
 * sable ; le parent fournit les commandes.
 */
export function BattleStage({
  setup,
  director,
  mySide,
  players,
  tier,
  tiers,
  arena,
  level,
  arenaRef,
  mine,
  theirs,
  ticker,
  timer,
  tablets,
  menu,
  side,
  overlay,
  paused,
}: {
  setup: BattleSetup;
  director: Director;
  mySide: Side;
  players: [PlayerView, PlayerView | null];
  /** Mon palier (teinte de l'interface), null hors classé. */
  tier: BoardTier | null;
  /** Emblème affiché dans chaque bannière. */
  tiers: [BoardTier | null, BoardTier | null];
  arena: ArenaId;
  level: FxLevel;
  arenaRef: (h: ArenaHandle | null) => void;
  mine?: RowProps;
  theirs?: RowProps;
  ticker: { text: string | null; tone: "mine" | "theirs" | "error" | "hint" };
  timer?: { secondsLeft: number | null; total: number } | null;
  tablets?: ReactNode;
  menu?: ReactNode;
  side?: ReactNode;
  overlay?: ReactNode;
  paused?: boolean;
}) {
  const t = useTranslations("battle.board");
  const name = usePlayerName();
  const world = useRef<HTMLDivElement>(null);
  const rig = useRef<HTMLDivElement>(null);
  const shaker = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const screen = useRef<HTMLDivElement>(null);
  const { bindStage } = director;
  useLayoutEffect(() => {
    if (world.current && rig.current && shaker.current && layer.current && screen.current) {
      bindStage({ world: world.current, rig: rig.current, shaker: shaker.current, layer: layer.current, screen: screen.current });
    }
    return () => bindStage(null);
  }, [bindStage]);
  const opp = (mySide === 0 ? 1 : 0) as Side;
  const { shown } = director;
  const standing = (s: Side) => shown.fighters[s].filter((f) => f.hp > 0).length;
  const live = !shown.finished;
  const orbs = (s: Side) =>
    live && shown.active === s ? <KiOrbs count={shown.orbs} max={setup.rules.orbs.max} side={s} label={t("orbs", { count: shown.orbs })} /> : null;

  const row = (s: Side, props: RowProps | undefined, place: "far" | "near") => (
    <ul className="stage-row" data-row={place}>
      {setup.teams[s].map((card, i) => {
        const k = `${s}-${i}`;
        return (
          <StageCard
            key={`${card.cardId}-${i}`}
            slot={SLOTS[s][i]}
            card={card}
            state={shown.fighters[s][i]}
            face={director.faces[k] ?? "front"}
            selected={props?.selected === i}
            targetable={props?.targets?.has(i)}
            ready={props?.ready?.has(i)}
            numbers={director.numbers[k] ?? NONE}
            onPress={props?.onPress}
            register={director.register}
            sizes={SIZES}
          />
        );
      })}
    </ul>
  );

  return (
    <div
      ref={world}
      className="stage"
      data-tier={tier ?? undefined}
      data-level={level}
      data-light={director.light === mySide ? "near" : "far"}
      data-paused={paused || undefined}
      onPointerDown={() => director.accelerate()}
    >
      <div className="stage-arena">
        <ArenaHost id={arena} level={level} handleRef={arenaRef} />
      </div>
      <div className="stage-light" aria-hidden="true">
        <span className="stage-light-near" />
        <span className="stage-light-far" />
      </div>

      <div className="stage-grid">
        <header className="stage-hud stage-hud-top">
          <PlayerBanner player={players[opp]} place="top" active={live && shown.active === opp} standing={standing(opp)} tier={tiers[opp]}>
            {orbs(opp)}
          </PlayerBanner>
          {menu}
        </header>

        <div className="stage-main">
          <div ref={rig} className="stage-rig">
            <div ref={shaker} className="stage-shaker">
              <div className="stage-board">
                {row(opp, theirs, "far")}
                <div className="stage-front">
                  <span className="stage-front-line" aria-hidden="true" />
                  {timer && <Incense secondsLeft={timer.secondsLeft} total={timer.total} />}
                  {director.banner && live && <TurnBanner banner={director.banner} mySide={mySide} theirName={name(players[opp])} />}
                </div>
                {row(mySide, mine, "near")}
              </div>
              <div ref={layer} className="stage-layer" aria-hidden="true" />
            </div>
          </div>
          {side && <aside className="stage-side">{side}</aside>}
        </div>

        <footer className="stage-hud stage-hud-bottom">
          <Ticker text={ticker.text} tone={ticker.tone} />
          <PlayerBanner player={players[mySide]} place="bottom" active={live && shown.active === mySide} standing={standing(mySide)} tier={tiers[mySide]}>
            {orbs(mySide)}
          </PlayerBanner>
          {tablets}
        </footer>
      </div>

      <div ref={screen} className="stage-screen" aria-hidden="true">
        {director.cutin && <CutIn cutin={director.cutin} setup={setup} mySide={mySide} />}
      </div>
      {overlay}
    </div>
  );
}
