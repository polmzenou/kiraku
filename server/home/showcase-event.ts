import "server-only";
import type { PodiumEntry } from "@/lib/event/view";
import { getShowcaseEventPodium, getShowcaseEventState } from "../event/showcase-queries";

export type HomeShowcaseEvent =
  | { phase: "upcoming" | "live"; startsAt: string; endsAt: string }
  | { phase: "ended"; endsAt: string; podium: PodiumEntry[] };

/**
 * Event vitrines sur l'accueil : invitation pendant l'event, podium après la clôture. null si l'admin ne l'a
 * pas allumé, si ses dates ne forment pas une fenêtre, ou s'il s'est terminé sans aucune vitrine.
 */
export async function getHomeShowcaseEvent(now = Date.now()): Promise<HomeShowcaseEvent | null> {
  const state = await getShowcaseEventState(now);
  if (!state.enabled || !state.phase) return null;
  if (state.phase !== "ended") return { phase: state.phase, startsAt: state.startsAt, endsAt: state.endsAt };
  const podium = await getShowcaseEventPodium(state);
  return podium.length > 0 ? { phase: "ended", endsAt: state.endsAt, podium } : null;
}
