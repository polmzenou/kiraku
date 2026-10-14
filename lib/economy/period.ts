import { dayKey, filterContext } from "@/lib/boosters/pool-filter";

// Périodes du jeu (missions, limites de la boutique) dans le fuseau game.timeZone : un jour va de
// minuit à minuit, une semaine du lundi au lundi (semaine ISO). Les bornes sont des instants UTC,
// justes même les jours de changement d'heure.

export type Period = "DAILY" | "WEEKLY";

type YMD = { year: number; month: number; day: number };

const DAY = 86_400_000;

/** Décalage du fuseau à l'instant `at`, en ms (heure locale − UTC). */
function offsetAt(at: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  })
    .formatToParts(new Date(at))
    .reduce<Record<string, number>>((acc, p) => (p.type === "literal" ? acc : { ...acc, [p.type]: Number(p.value) }), {});
  const local = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return local - Math.floor(at / 1000) * 1000;
}

/** Instant UTC de minuit, heure locale, le jour `d`. */
export function localMidnight(d: YMD, timeZone: string): Date {
  const guess = Date.UTC(d.year, d.month - 1, d.day);
  let at = guess - offsetAt(guess, timeZone);
  // Le décalage peut changer entre l'estimation et minuit local (changement d'heure) : on corrige
  at = guess - offsetAt(at, timeZone);
  return new Date(at);
}

function addDays(d: YMD, n: number): YMD {
  const t = new Date(Date.UTC(d.year, d.month - 1, d.day) + n * DAY);
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() };
}

/** Lundi de la semaine du jour `d`. */
function mondayOf(d: YMD): YMD {
  const dow = new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay(); // 0 = dimanche
  return addDays(d, -((dow + 6) % 7));
}

/** Semaine ISO 8601 : « 2026-W42 » (l'année ISO peut différer de l'année civile fin décembre). */
export function isoWeekKey(d: YMD): string {
  const thursday = addDays(mondayOf(d), 3);
  const jan1 = Date.UTC(thursday.year, 0, 1);
  const week = Math.floor((Date.UTC(thursday.year, thursday.month - 1, thursday.day) - jan1) / DAY / 7) + 1;
  return `${thursday.year}-W${String(week).padStart(2, "0")}`;
}

export type PeriodWindow = { key: string; start: Date; end: Date };

/** Période en cours à l'instant `now` : clé (« 2026-10-14 », « 2026-W42 ») et bornes [start, end[. */
export function periodWindow(period: Period, now: Date, timeZone: string): PeriodWindow {
  const today = filterContext(now, timeZone);
  if (period === "DAILY") {
    return { key: dayKey(today), start: localMidnight(today, timeZone), end: localMidnight(addDays(today, 1), timeZone) };
  }
  const monday = mondayOf(today);
  return {
    key: isoWeekKey(today),
    start: localMidnight(monday, timeZone),
    end: localMidnight(addDays(monday, 7), timeZone),
  };
}
