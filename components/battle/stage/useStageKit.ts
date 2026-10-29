"use client";

import { useCallback, useRef } from "react";
import { useFxLevel } from "@/components/motion/MotionPreference";
import { ARENA_BY_TIER } from "@/lib/battle/arenas";
import type { BoardTier } from "@/lib/battle/tiers";
import type { BattleSetup, BattleState, Side } from "@/lib/battle/types";
import { useBattleSound } from "./useBattleSound";
import { useBattleSpeed } from "./useBattleSpeed";
import { useDirector, type ArenaHandle } from "./useDirector";

/**
 * Ce que le direct et le replay partagent autour de la scène : arène du palier (dōjō hors classé),
 * niveau d'effets, vitesse, son et metteur en scène (impact frames en Mie, le style retenu).
 */
export function useStageKit(initial: BattleState, { setup, mySide, tier }: { setup: BattleSetup; mySide: Side; tier: BoardTier | null }) {
  const arena = ARENA_BY_TIER[tier ?? "BRONZE"];
  const level = useFxLevel();
  const speed = useBattleSpeed();
  const sound = useBattleSound(arena, true);
  const arenaHandle = useRef<ArenaHandle | null>(null);
  const arenaRef = useCallback((h: ArenaHandle | null) => void (arenaHandle.current = h), []);
  const director = useDirector(initial, { setup, mySide, level, style: "mie", speed, sound: sound.port, arena: arenaHandle });
  return { arena, level, speed, sound, arenaRef, director };
}
