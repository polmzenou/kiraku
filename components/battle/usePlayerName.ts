"use client";

import { useTranslations } from "next-intl";
import type { PlayerView } from "@/lib/battle/view";

/** Nom affiché d'un joueur : son pseudo, « Bot · Tengu » pour un bot, un tiret pour une place encore libre. */
export function usePlayerName() {
  const t = useTranslations("battle");
  return (p: PlayerView | null) => (!p ? "—" : "bot" in p ? t("board.bot", { name: t(`bots.${p.bot}` as "bots.TENGU") }) : p.username);
}
