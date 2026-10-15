"use client";

import { useTranslations } from "next-intl";
import type { BattleActionError } from "@/server/actions/battle";

/** Message d'un refus du serveur (chaque code a sa traduction dans battle.errors). */
export function useBattleError() {
  const t = useTranslations("battle.errors");
  return (code: BattleActionError) => t(code);
}
