import "server-only";
import { getLocale } from "next-intl/server";
import { unstable_cache } from "next/cache";
import { eventGaugeView, type EventGaugeMetric, type EventGaugeView } from "@/lib/home/event-gauge";
import { localize, parseLocalized } from "@/lib/boosters/types";
import { prisma } from "../db";
import { getSetting } from "../settings";

/**
 * Ce que compte la jauge dans la fenêtre, à la lecture : la transaction d'ouverture ou de lancer reste sans
 * ligne partagée à verrouiller.
 * - BOOSTERS : boosters ouverts par des comptes inscrits et non bannis. Un invité qui s'inscrit apporte ses
 *   ouvertures faites depuis le début de l'event (aucune date d'inscription en base).
 * - COINFLIPS : tables de pile ou face jouées (les deux joueurs sont forcément inscrits).
 */
function countMetric(metric: EventGaugeMetric, startsAt: string, endsAt: string): Promise<number> {
  const window = { gte: new Date(startsAt), lt: new Date(endsAt) };
  if (metric === "COINFLIPS") return prisma.coinFlip.count({ where: { status: "DONE", resolvedAt: window } });
  return prisma.boosterOpening.count({ where: { createdAt: window, user: { isGuest: false, bannedAt: null } } });
}

// Une fonction en cache par durée (home.eventGauge.cacheSeconds) : la durée d'unstable_cache est fixée à sa création
const counters = new Map<number, typeof countMetric>();
function cachedCount(seconds: number) {
  let counter = counters.get(seconds);
  if (!counter) {
    counter = unstable_cache(countMetric, ["home-event-gauge-v2", String(seconds)], { revalidate: seconds });
    counters.set(seconds, counter);
  }
  return counter;
}

/** Nom du lot promis à tous, dans la langue du lecteur ; null sans lot ou s'il a disparu. */
async function rewardName(lotId: string | null): Promise<string | null> {
  if (!lotId) return null;
  const [lot, locale] = await Promise.all([prisma.lot.findUnique({ where: { id: lotId }, select: { name: true } }), getLocale()]);
  return lot ? localize(parseLocalized(lot.name), locale) : null;
}

/** État de la jauge, interrupteur ignoré (page d'admin) ; null si les réglages ne forment pas une fenêtre. */
export async function readEventGauge(now = Date.now()): Promise<EventGaugeView | null> {
  const [startsAt, endsAt, goal, cacheSeconds, metric, rewardLotId] = await Promise.all([
    getSetting("home.eventGauge.startsAt"),
    getSetting("home.eventGauge.endsAt"),
    getSetting("home.eventGauge.goal"),
    getSetting("home.eventGauge.cacheSeconds"),
    getSetting("home.eventGauge.metric"),
    getSetting("home.eventGauge.rewardLotId"),
  ]);
  const reward = await rewardName(rewardLotId);
  const eventWindow = { startsAt: Date.parse(startsAt), endsAt: Date.parse(endsAt), goal, metric, reward };
  const empty = eventGaugeView({ ...eventWindow, count: 0 }, now);
  // Avant le début, rien à compter
  if (!empty || empty.phase === "upcoming") return empty;
  return eventGaugeView({ ...eventWindow, count: await cachedCount(cacheSeconds)(metric, startsAt, endsAt) }, now);
}

/** Jauge et heure du serveur (comptes à rebours), pour un composant serveur. */
export async function getEventGaugeNow(): Promise<{ gauge: EventGaugeView | null; serverNow: number }> {
  const serverNow = Date.now();
  return { gauge: await getEventGauge(serverNow), serverNow };
}

/** Jauge affichée sur l'accueil ; null si l'admin l'a coupée. */
export async function getEventGauge(now = Date.now()): Promise<EventGaugeView | null> {
  if (!(await getSetting("home.eventGauge.enabled"))) return null;
  return readEventGauge(now);
}
