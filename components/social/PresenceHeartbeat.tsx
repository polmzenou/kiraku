"use client";

import { useEffect } from "react";
import { presencePingAction } from "@/server/actions/presence";
import { usePoll } from "../realtime/usePoll";

const ping = async () => {
  await presencePingAction();
};

/**
 * Battement de présence (pastille verte) : un appel au montage, puis toutes les `seconds` tant que le
 * joueur est là ; rien onglet caché ou joueur inactif, reprise à son retour. Ne rend rien.
 */
export function PresenceHeartbeat({ seconds }: { seconds: number }) {
  usePoll(ping, { seconds });
  useEffect(() => void ping().catch(() => undefined), []);
  return null;
}
