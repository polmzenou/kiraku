"use client";

import { useTranslations } from "next-intl";
import { other } from "@/lib/battle/engine";
import { TECHNIQUE_TARGET, ULTIMATE_TARGET, type BattleEvent, type BattleSetup, type Side } from "@/lib/battle/types";
import type { PlayerView } from "@/lib/battle/view";
import { usePlayerName } from "./usePlayerName";

/** Phrase du fil des actions pour un événement (null : rien à dire), partagée par le direct, le replay et le bac à sable. */
export function useLogLine(setup: BattleSetup, players: readonly [PlayerView, PlayerView | null]) {
  const t = useTranslations("battle");
  const name = usePlayerName();
  const card = (side: Side, i: number) => setup.teams[side][i]?.name ?? "?";
  const player = (side: Side) => name(players[side]);

  return (e: BattleEvent): string | null => {
    switch (e.t) {
      case "turn":
        return t("log.turn", { player: player(e.side) });
      case "attack": {
        if (!e.technique) return t("log.attack", { actor: card(e.side, e.actor), target: card(other(e.side), e.target ?? 0) });
        const technique = t(`techniques.${e.technique}.name`);
        if (e.target === null) return t("log.technique", { actor: card(e.side, e.actor), technique });
        const targetSide = TECHNIQUE_TARGET[e.technique] === "ALLY" ? e.side : other(e.side);
        return t("log.techniqueOn", { actor: card(e.side, e.actor), technique, target: card(targetSide, e.target) });
      }
      case "ultimate": {
        const ultimate = t(`ultimates.${e.ultimate}.name`);
        if (e.target === null) return t("log.ultimate", { actor: card(e.side, e.actor), ultimate });
        const targetSide = ULTIMATE_TARGET[e.ultimate] === "DEAD_ALLY" ? e.side : other(e.side);
        return t("log.ultimateOn", { actor: card(e.side, e.actor), ultimate, target: card(targetSide, e.target) });
      }
      case "raise":
        return t("log.raise", { target: card(e.side, e.index), hp: e.hp });
      case "damage":
        return t(e.crit ? "log.crit" : "log.damage", { target: card(e.side, e.index), amount: e.amount });
      case "block":
        return t(e.pierced ? "log.shatter" : "log.block", { target: card(e.side, e.index) });
      case "heal":
        return e.amount > 0 ? t("log.heal", { target: card(e.side, e.index), amount: e.amount }) : null;
      case "lifesteal":
        return t("log.lifesteal", { target: card(e.side, e.index) });
      case "orbs":
        return t("log.orbs", { player: player(e.side), orbs: e.orbs });
      case "poisoned":
        return t("log.poisoned", { target: card(e.side, e.index) });
      case "poison":
        return t("log.poison", { target: card(e.side, e.index), amount: e.amount });
      case "riposte":
        return t("log.riposte", { target: card(e.side, e.index) });
      case "ko":
        return t("log.ko", { target: card(e.side, e.index) });
      case "synergy_break":
        return t("log.synergyBreak", { player: player(e.side), universe: setup.synergy?.[e.side]?.name ?? "" });
      case "revive":
        return t("log.revive", { target: card(e.side, e.index), hp: e.hp });
      case "barrier":
        return t("log.barrier", { target: card(e.side, e.index) });
      case "buff":
        return t("log.buff", { player: player(e.side), pct: e.pct });
      case "seal":
        return t("log.seal", { target: card(e.side, e.index) });
      case "timeout":
        return t("log.timeout", { player: player(e.side) });
      case "forfeit":
        return t("log.forfeit", { player: player(e.side) });
      default:
        return null;
    }
  };
}
