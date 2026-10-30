"use client";

import { useEffect, useState, useTransition } from "react";
import { voteDiscordPollAction } from "@/server/actions/welcome";

/** Ce qu'on mettrait sur le Discord (clés v25Announcement.discord.ideas.*). */
export const DISCORD_IDEAS = ["news", "tournaments", "contests", "lotteries", "feedback", "cards"] as const;

// Prévient les autres sondages de la page (modal de la v2.5 au-dessus du carrousel) qu'une réponse est enregistrée
const VOTED_EVENT = "kiraku:discord-poll";

export type DiscordPollStatus = "idle" | "thanks" | "already" | "error";

/**
 * Sondage Discord, côté client : une seule réponse par joueur, définitive. Une fois enregistrée (ici, dans
 * un autre sondage de la page ou lors d'une visite précédente), les boutons restent figés sur elle.
 */
export function useDiscordPoll(initial: boolean | null) {
  const [vote, setVote] = useState(initial);
  const [status, setStatus] = useState<DiscordPollStatus>(initial === null ? "idle" : "already");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const onVoted = (event: Event) => {
      setVote((event as CustomEvent<boolean>).detail);
      setStatus((current) => (current === "idle" || current === "error" ? "thanks" : current));
    };
    window.addEventListener(VOTED_EVENT, onVoted);
    return () => window.removeEventListener(VOTED_EVENT, onVoted);
  }, []);

  const answer = (value: boolean) =>
    startTransition(async () => {
      const result = await voteDiscordPollAction(value).catch(() => null);
      if (!result) {
        setStatus("error");
        return;
      }
      setVote(result.vote);
      setStatus(result.already ? "already" : "thanks");
      window.dispatchEvent(new CustomEvent(VOTED_EVENT, { detail: result.vote }));
    });

  return { vote, status, pending, locked: pending || vote !== null, answer };
}
