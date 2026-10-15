"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { BattleSetup, BattleState, Side } from "@/lib/battle/types";
import type { BoardTier } from "@/lib/battle/tiers";
import type { PlayerView } from "@/lib/battle/view";
import { BattleFuda, type Fx } from "./BattleFuda";

export function usePlayerName() {
  const t = useTranslations("battle");
  return (p: PlayerView | null) => (!p ? "—" : "bot" in p ? t("board.bot", { name: t(`bots.${p.bot}` as "bots.TENGU") }) : p.username);
}

/** Orbes : cristaux en losange, pleins jusqu'au nombre disponible. */
export function Orbs({ count, max, label }: { count: number; max: number; label: string }) {
  return (
    <span className="flex items-center gap-1.5" role="img" aria-label={label}>
      {Array.from({ length: Math.max(max, count) }, (_, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={`size-3 rotate-45 rounded-[2px] border transition-[opacity,transform] duration-300 md:size-4 ${
            i < count
              ? "scale-100 border-[#fff2c2] bg-[linear-gradient(135deg,#fff2c2,#D9B556_50%,#8c6a1f)] shadow-[0_0_8px_rgba(217,181,86,0.8)]"
              : "scale-90 border-[#5a4d3c] bg-[#1a1511] opacity-70"
          }`}
        />
      ))}
    </span>
  );
}

type RowProps = {
  selected?: number | null;
  targets?: ReadonlySet<number>;
  ready?: ReadonlySet<number>;
  onPress?: (index: number) => void;
};

function Row({
  side,
  setup,
  shown,
  fx,
  cardRef,
  selected,
  targets,
  ready,
  onPress,
}: RowProps & { side: Side; setup: BattleSetup; shown: BattleState; fx: Record<string, Fx[]>; cardRef: (side: Side, i: number) => (el: HTMLElement | null) => void }) {
  const t = useTranslations("battle.board");
  return (
    <ul className="mx-auto grid w-full max-w-[540px] grid-cols-3 gap-4 md:gap-9 2xl:max-w-[600px]">
      {setup.teams[side].map((card, i) => {
        const st = shown.fighters[side][i];
        const label = st.hp > 0 ? t("fighter", { name: card.name, hp: st.hp, max: st.maxHp, atk: card.atk }) : t("dead", { name: card.name });
        return (
          <li key={card.cardId}>
            <BattleFuda
              card={card}
              state={st}
              selected={selected === i}
              targetable={targets?.has(i)}
              ready={ready?.has(i)}
              fx={fx[`${side}-${i}`] ?? []}
              onPress={onPress ? () => onPress(i) : undefined}
              label={label}
              cardRef={cardRef(side, i)}
            />
          </li>
        );
      })}
    </ul>
  );
}

/** Plaque d'un joueur : sceau, nom, cartes encore debout, et ce qu'on lui confie (orbes, minuteur). */
function Plate({ player, standing, active, children }: { player: PlayerView | null; standing: number; active: boolean; children?: ReactNode }) {
  const t = useTranslations("battle.board");
  const name = usePlayerName();
  const initial = !player ? "?" : name(player).slice(0, 1).toUpperCase();
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 px-1">
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          aria-hidden="true"
          className={`flex size-10 shrink-0 items-center justify-center rounded-full border-2 bg-[radial-gradient(circle_at_35%_30%,#3a3029,#15120f)] font-title text-lg font-extrabold text-washi-paper transition-shadow md:size-12 md:text-xl ${
            active ? "border-[var(--board-accent)] shadow-[0_0_16px_var(--board-glow)]" : "border-[#4a3f33]"
          }`}
        >
          {initial}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-bold text-washi-paper md:text-base">{name(player)}</span>
          <span className="text-xs tabular-nums text-[#a89f92]">{t("standing", { count: standing })}</span>
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-3">{children}</div>
    </div>
  );
}

/**
 * Plateau de jeu de cartes : table laquée, liseré à la couleur du rang (classé), un tapis par camp,
 * la ligne de front au milieu avec le médaillon du tour. L'adversaire en haut, soi en bas. Sur
 * desktop, `side` occupe une colonne à droite (détail de la carte, journal). Partagé par le direct
 * et le replay.
 */
export function BoardLayout({
  setup,
  shown,
  fx,
  mySide,
  players,
  tier,
  boardRef,
  cardRef,
  front,
  frontAction,
  myPlate,
  theirPlate,
  side,
  controls,
  mine,
  theirs,
}: {
  setup: BattleSetup;
  shown: BattleState;
  fx: Record<string, Fx[]>;
  mySide: Side;
  players: [PlayerView, PlayerView | null];
  tier: BoardTier | null;
  boardRef: (el: HTMLElement | null) => void;
  cardRef: (side: Side, i: number) => (el: HTMLElement | null) => void;
  /** Contenu du médaillon central et de la bannière. */
  front: ReactNode;
  /** Bouton posé sur la ligne de front, à droite (desktop) : « Fin du tour ». */
  frontAction?: ReactNode;
  myPlate?: ReactNode;
  theirPlate?: ReactNode;
  side?: ReactNode;
  controls: ReactNode;
  mine?: RowProps;
  theirs?: RowProps;
}) {
  const opp = (mySide === 0 ? 1 : 0) as Side;
  const standing = (s: Side) => shown.fighters[s].filter((f) => f.hp > 0).length;
  return (
    // Mobile : plateau puis commandes. Desktop : plateau à gauche (deux rangées), commandes puis
    // détail et journal dans la colonne de droite, sans défilement.
    <div className="mx-auto grid w-full max-w-[1200px] items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:grid-rows-[auto_1fr] lg:gap-x-6">
      <div className="min-w-0 lg:row-span-2">
        <section ref={boardRef} data-tier={tier ?? undefined} className="battle-board battle-rim rounded-[18px] p-[3px] md:p-[5px]">
          <div className="battle-table flex flex-col gap-2 rounded-[15px] p-2.5 md:gap-2.5 md:p-4">
            <Plate player={players[opp]} standing={standing(opp)} active={!shown.finished && shown.active === opp}>
              {theirPlate}
            </Plate>
            <div className="battle-field rounded-xl px-3 pt-4 pb-5 md:px-8 md:pt-5 md:pb-7">
              <Row side={opp} setup={setup} shown={shown} fx={fx} cardRef={cardRef} {...theirs} />
            </div>

            {/* Ligne de front : trait de pinceau à la couleur du rang, médaillon du tour au centre */}
            <div className="relative flex h-12 items-center justify-center md:h-16">
              <span aria-hidden="true" className="battle-front absolute inset-x-2 top-1/2 h-[3px] -translate-y-1/2 rounded-full" />
              <div className="relative">{front}</div>
              {frontAction && <div className="absolute top-1/2 right-0 hidden -translate-y-1/2 md:block">{frontAction}</div>}
            </div>

            <div className="battle-field rounded-xl px-3 pt-4 pb-5 md:px-8 md:pt-5 md:pb-7">
              <Row side={mySide} setup={setup} shown={shown} fx={fx} cardRef={cardRef} {...mine} />
            </div>
            <Plate player={players[mySide]} standing={standing(mySide)} active={!shown.finished && shown.active === mySide}>
              {myPlate}
            </Plate>
          </div>
        </section>
      </div>
      <div className="min-w-0 lg:col-start-2 lg:row-start-1">{controls}</div>
      {side && <aside className="hidden min-w-0 flex-col gap-4 lg:col-start-2 lg:row-start-2 lg:flex">{side}</aside>}
    </div>
  );
}

/** Médaillon du tour : disque laqué cerclé à la couleur du rang. */
export function Medallion({ children, highlight }: { children: ReactNode; highlight: boolean }) {
  return (
    <span
      className={`battle-rim flex size-12 items-center justify-center rounded-full p-[3px] md:size-16 ${highlight ? "" : "opacity-90"}`}
    >
      <span className="flex size-full flex-col items-center justify-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#3a3029,#120f0c)] text-center leading-none text-washi-paper">
        {children}
      </span>
    </span>
  );
}
