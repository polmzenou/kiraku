"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { BattleSetup, BattleState, Side } from "@/lib/battle/types";
import type { PlayerView } from "@/lib/battle/view";
import { BattleFuda, type Fx } from "./BattleFuda";

export function usePlayerName() {
  const t = useTranslations("battle");
  return (p: PlayerView | null) => (!p ? "—" : "bot" in p ? t("board.bot", { name: t(`bots.${p.bot}` as "bots.TENGU") }) : p.username);
}

/** Orbes 気 du camp actif : pleins / vides jusqu'au plafond. */
export function Orbs({ count, max, label }: { count: number; max: number; label: string }) {
  return (
    <span className="flex items-center gap-1" role="img" aria-label={label}>
      {Array.from({ length: Math.max(max, count) }, (_, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={`size-3.5 rounded-full border-2 transition-colors ${i < count ? "border-kin bg-kin shadow-[0_0_6px_var(--color-kin)]" : "border-border bg-transparent"}`}
        />
      ))}
    </span>
  );
}

type RowProps = {
  side: Side;
  setup: BattleSetup;
  shown: BattleState;
  fx: Record<string, Fx[]>;
  lunge: { side: Side; index: number } | null;
  /** Ma rangée (en bas) ou celle de l'adversaire (en haut). */
  mine: boolean;
  selected?: number | null;
  targets?: ReadonlySet<number>;
  ready?: ReadonlySet<number>;
  onPress?: (index: number) => void;
};

function Row({ side, setup, shown, fx, lunge, mine, selected, targets, ready, onPress }: RowProps) {
  const t = useTranslations("battle.board");
  return (
    <ul className="grid grid-cols-3 gap-2 sm:gap-4">
      {setup.teams[side].map((card, i) => {
        const st = shown.fighters[side][i];
        const label = st.hp > 0 ? t("fighter", { name: card.name, hp: st.hp, max: st.maxHp, atk: card.atk }) : t("dead", { name: card.name });
        return (
          <li key={card.cardId}>
            <BattleFuda
              card={card}
              state={st}
              lunge={lunge && lunge.side === side && lunge.index === i ? (mine ? "up" : "down") : null}
              selected={selected === i}
              targetable={targets?.has(i)}
              ready={ready?.has(i)}
              fx={fx[`${side}-${i}`] ?? []}
              onPress={onPress ? () => onPress(i) : undefined}
              label={label}
            />
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Plateau en portrait : l'adversaire en haut, soi en bas, la bande du tour au milieu. Partagé par
 * la partie en direct et le replay ; `controls` est la barre du bas (actions ou lecture).
 */
export function BoardLayout({
  setup,
  shown,
  fx,
  lunge,
  mySide,
  players,
  middle,
  controls,
  mine,
  theirs,
}: {
  setup: BattleSetup;
  shown: BattleState;
  fx: Record<string, Fx[]>;
  lunge: { side: Side; index: number } | null;
  mySide: Side;
  players: [PlayerView, PlayerView | null];
  middle: ReactNode;
  controls: ReactNode;
  mine?: Omit<RowProps, "side" | "setup" | "shown" | "fx" | "lunge" | "mine">;
  theirs?: Omit<RowProps, "side" | "setup" | "shown" | "fx" | "lunge" | "mine">;
}) {
  const name = usePlayerName();
  const opp = (mySide === 0 ? 1 : 0) as Side;
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-3">
      <p className="flex items-center justify-between text-sm font-bold">
        <span className="truncate">{name(players[opp])}</span>
      </p>
      <Row side={opp} setup={setup} shown={shown} fx={fx} lunge={lunge} mine={false} {...theirs} />
      <div className="flex min-h-14 items-center justify-between gap-2 rounded-button border border-border bg-surface px-3 py-2">{middle}</div>
      <Row side={mySide} setup={setup} shown={shown} fx={fx} lunge={lunge} mine {...mine} />
      <p className="text-sm font-bold">{name(players[mySide])}</p>
      {controls}
    </div>
  );
}
