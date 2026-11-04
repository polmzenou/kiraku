import "server-only";
import { unstable_cache } from "next/cache";
import { eventGaugeView, type EventGaugeView } from "@/lib/home/event-gauge";
import { prisma } from "../db";
import { getSetting } from "../settings";

/**
 * Boosters ouverts dans la fenêtre par des comptes inscrits et non bannis. Compté à la lecture : la
 * transaction d'ouverture reste sans ligne partagée à verrouiller. Un invité qui s'inscrit apporte ses
 * ouvertures faites depuis le début de l'event (aucune date d'inscription en base).
 */
function countOpenings(startsAt: string, endsAt: string): Promise<number> {
  return prisma.boosterOpening.count({
    where: { createdAt: { gte: new Date(startsAt), lt: new Date(endsAt) }, user: { isGuest: false, bannedAt: null } },
  });
}

// Une fonction en cache par durée (home.eventGauge.cacheSeconds) : la durée d'unstable_cache est fixée à sa création
const counters = new Map<number, typeof countOpenings>();
function cachedCount(seconds: number) {
  let counter = counters.get(seconds);
  if (!counter) {
    counter = unstable_cache(countOpenings, ["home-event-gauge-v1", String(seconds)], { revalidate: seconds });
    counters.set(seconds, counter);
  }
  return counter;
}

/** État de la jauge, interrupteur ignoré (page d'admin) ; null si les réglages ne forment pas une fenêtre. */
export async function readEventGauge(now = Date.now()): Promise<EventGaugeView | null> {
  const [startsAt, endsAt, goal, cacheSeconds] = await Promise.all([
    getSetting("home.eventGauge.startsAt"),
    getSetting("home.eventGauge.endsAt"),
    getSetting("home.eventGauge.goal"),
    getSetting("home.eventGauge.cacheSeconds"),
  ]);
  const eventWindow = { startsAt: Date.parse(startsAt), endsAt: Date.parse(endsAt), goal };
  const empty = eventGaugeView({ ...eventWindow, count: 0 }, now);
  // Avant le début, rien à compter
  if (!empty || empty.phase === "upcoming") return empty;
  return eventGaugeView({ ...eventWindow, count: await cachedCount(cacheSeconds)(startsAt, endsAt) }, now);
}

/** Jauge affichée sur l'accueil ; null si l'admin l'a coupée. */
export async function getEventGauge(now = Date.now()): Promise<EventGaugeView | null> {
  if (!(await getSetting("home.eventGauge.enabled"))) return null;
  return readEventGauge(now);
}
