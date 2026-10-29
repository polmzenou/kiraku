"use client";

import { useTranslations } from "next-intl";
import { memo, useLayoutEffect, useRef } from "react";
import { CardBack } from "@/components/fuda/CardBack";
import { Fuda } from "@/components/fuda/Fuda";
import type { Slot } from "@/lib/battle/choreography";
import type { FighterSetup, FighterState } from "@/lib/battle/types";
import type { CardEls, StageNumber } from "./useDirector";

type Props = {
  slot: Slot;
  card: FighterSetup;
  state: FighterState;
  face: "back" | "front";
  selected?: boolean;
  targetable?: boolean;
  ready?: boolean;
  numbers: readonly StageNumber[];
  onPress?: (index: number) => void;
  register: (slot: Slot, els: CardEls | null) => void;
  sizes: string;
};

/**
 * Fuda posée sur l'arène. Trois enveloppes imbriquées portent chacune ses mouvements sans se gêner :
 * la ruée (`move`), le recul et les secousses (`hit`), la pose (respiration, sélection, chute au K.-O.).
 * Les états durables se lisent sur la carte : kekkai de la barrière, ofuda du sceau, encre du poison,
 * flammes d'or de l'encouragement.
 */
export const StageCard = memo(function StageCard({ slot, card, state, face, selected, targetable, ready, numbers, onPress, register, sizes }: Props) {
  const t = useTranslations("battle.board");
  const tk = useTranslations("battle.keywords");
  const root = useRef<HTMLLIElement>(null);
  const move = useRef<HTMLDivElement>(null);
  const hit = useRef<HTMLDivElement>(null);
  const flash = useRef<HTMLSpanElement>(null);
  const crack = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    if (!root.current || !move.current || !hit.current) return;
    register(slot, { root: root.current, move: move.current, hit: hit.current, flash: flash.current, crack: crack.current });
    return () => register(slot, null);
  }, [register, slot]);

  const dead = state.hp <= 0;
  const hp = Math.max(0, Math.min(1, state.hp / Math.max(1, state.maxHp)));
  const buffed = state.buffTurns > 0 && state.buffPct > 0;
  const atk = buffed ? Math.floor((card.atk * (100 + state.buffPct)) / 100) : card.atk;
  const interactive = Boolean(onPress) && !dead;
  const statuses = [
    state.barrier && !dead ? t("barrier") : null,
    state.sealed && !dead ? t("sealed") : null,
    state.poisonTurns > 0 && !dead ? t("poisoned") : null,
    buffed && !dead ? t("buffed", { pct: state.buffPct }) : null,
    ...card.keywords.map((k) => tk(`${k}.name`)),
  ].filter(Boolean);
  const label = [dead ? t("dead", { name: card.name }) : t("fighter", { name: card.name, hp: state.hp, max: state.maxHp, atk }), ...statuses].join(" · ");

  return (
    <li
      ref={root}
      className="stage-slot"
      data-dead={dead || undefined}
      data-selected={selected || undefined}
      data-ready={ready || undefined}
      data-target={targetable || undefined}
    >
      <span aria-hidden="true" className="stage-shadow" />
      <span aria-hidden="true" className="stage-sigil" />
      <div ref={move} className="stage-move">
        <div ref={hit} className="stage-hit">
          <button
            type="button"
            className="stage-pose"
            onClick={interactive ? () => onPress?.(slot.index) : undefined}
            aria-disabled={!interactive}
            aria-pressed={onPress ? Boolean(selected) : undefined}
            aria-label={label}
            style={{ animationDelay: `${-slot.index * 1.1 - slot.side * 0.6}s` }}
          >
            <span className="stage-flip" data-face={face}>
              <span className="stage-face">
                <Fuda card={card} size="sm" variant="battle" tilt={false} sizes={sizes} />
              </span>
              <span className="stage-face stage-back">
                <CardBack flat />
              </span>
            </span>
            {state.barrier && !dead && <span aria-hidden="true" className="st-kekkai" />}
            {state.poisonTurns > 0 && !dead && (
              <span aria-hidden="true" className="st-venom">
                <i />
                <i />
                <i />
              </span>
            )}
            {buffed && !dead && (
              <span aria-hidden="true" className="st-aura">
                <i />
                <i />
                <i />
                <i />
              </span>
            )}
            {state.sealed && !dead && (
              <span aria-hidden="true" className="st-seal">
                <span className="st-seal-rope" />
                <span className="st-seal-fuda">{t("sealed")}</span>
              </span>
            )}
            <span ref={flash} aria-hidden="true" className="stage-flash" />
            <span ref={crack} aria-hidden="true" className="stage-crack" />
            {card.keywords.length > 0 && (
              <span aria-hidden="true" className="stage-keywords">
                {card.keywords.map((k) => (
                  <span key={k} className="stage-kw">
                    {tk(`${k}.name`)}
                  </span>
                ))}
              </span>
            )}
            {dead && (
              <span aria-hidden="true" className="stage-ko">
                {t("ko")}
              </span>
            )}
          </button>
          <span aria-hidden="true" className="stage-gem stage-gem-atk" data-buffed={buffed || undefined}>
            {atk}
          </span>
          <span aria-hidden="true" className="stage-gem stage-gem-hp" data-hurt={state.hp < state.maxHp || undefined}>
            {state.hp}
          </span>
          <span aria-hidden="true" className="stage-hp" data-level={hp > 0.5 ? "high" : hp > 0.25 ? "mid" : "low"}>
            <span className="stage-hp-trail" style={{ transform: `scaleX(${hp})` }} />
            <span className="stage-hp-fill" style={{ transform: `scaleX(${hp})` }} />
          </span>
        </div>
        <span aria-hidden="true" className="stage-numbers">
          {numbers.map((n) => (
            <span key={n.id} className="stage-num" data-kind={n.kind}>
              {n.kind === "crit" && <small>{t("crit")}</small>}
              {n.kind === "block" ? t("block") : `${n.kind === "heal" ? "+" : "−"}${n.amount}`}
            </span>
          ))}
        </span>
      </div>
    </li>
  );
});
