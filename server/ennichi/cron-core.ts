// Passage du cron de l'Ennichi (étape 18d, app/api/cron/ennichi/route.ts), toutes les 5 minutes :
//   - pendant la fête et la clôture, les paliers de lanternes atteints se figent ; chaque palier atteint est rejoué à
//     chaque passage (un joueur devenu éligible après la fin d'un envoi est servi même s'il n'ouvre plus de booster) ;
//   - après le tirage, les envois de paliers pas encore finis continuent ;
//   - à la date de clôture, si l'équipe n'a pas lancé « Arrêter et tirer », le tirage se fait tout seul ;
//   - après le tirage, les prix pas encore versés le sont (relancé sans risque : chacun n'est versé qu'une fois).
// Trois étapes isolées : une erreur dans l'une (versement impossible, panne) n'empêche pas les suivantes. Sans effet
// tant que la fête est coupée. Client, horloge et opérations injectés : serveur ou tests (doubles).
import type { PrismaClient } from "@/generated/prisma/client";
import type { EnnichiPhase, EnnichiRules, EnnichiSchedule } from "@/lib/ennichi/rules";
import type { LotDeps } from "../economy/lots";
import type { OnNotified } from "../social/notify";
import { drawEnnichiWith, EnnichiCloseError, payAwardsWith, type DrawSecrets } from "./close-core";
import { lanternCountsWith, recordReachedTiersWith, sendTierWith } from "./lanterns-core";

/** Opérations du passage (les cœurs de l'Ennichi ; des doubles en test). */
export type EnnichiCronOps = {
  lanternCounts: typeof lanternCountsWith;
  recordReachedTiers: typeof recordReachedTiersWith;
  sendTier: typeof sendTierWith;
  draw: typeof drawEnnichiWith;
  payAwards: typeof payAwardsWith;
};

const CORE: EnnichiCronOps = {
  lanternCounts: lanternCountsWith,
  recordReachedTiers: recordReachedTiersWith,
  sendTier: sendTierWith,
  draw: drawEnnichiWith,
  payAwards: payAwardsWith,
};

export type EnnichiCronInput = {
  state: { rules: EnnichiRules; schedule: EnnichiSchedule | null; phase: EnnichiPhase };
  now: Date;
  /** Horloge réelle (Date.now en production) : le passage s'arrête avant `budgetMs`. */
  clock: () => number;
  budgetMs: number;
  pay: { lotDeps: LotDeps; now: Date; onNotified?: OnNotified };
  /** Clé des graines et textes des titres, lus seulement si le tirage de secours a lieu. */
  secrets: () => Promise<DrawSecrets>;
};

export type EnnichiCronResult = {
  phase: EnnichiPhase;
  lit: number;
  reached: number[];
  granted: number;
  drawn: boolean;
  paid: number;
  /** Étapes en échec (« tiers », « draw », « awards ») : la route répond 500 pour qu'on le voie. */
  errors: string[];
};

export async function runEnnichiCronWith(db: PrismaClient, input: EnnichiCronInput, ops: EnnichiCronOps = CORE): Promise<EnnichiCronResult> {
  const { state, now, clock } = input;
  const result: EnnichiCronResult = { phase: state.phase, lit: 0, reached: [], granted: 0, drawn: false, paid: 0, errors: [] };
  if (state.phase === "off" || state.phase === "before" || !state.schedule) return result;
  const { rules, schedule } = state;
  const deadline = clock() + input.budgetMs;

  try {
    if (state.phase === "live" || state.phase === "closing") {
      // Lanternes comptées jusqu'à la clôture annoncée, même si le passage tombe après
      const { lit } = await ops.lanternCounts(db, rules.edition, now < schedule.closesAt ? now : schedule.closesAt);
      result.lit = lit;
      result.reached = await ops.recordReachedTiers(db, rules, lit, now);
    }
    // Paliers atteints : pendant la fête et la clôture, tous à chaque passage ; après le tirage, les envois pas finis
    const tiers = await db.ennichiTierReached.findMany({
      where: { edition: rules.edition, ...(state.phase === "closed" ? { finishedAt: null } : {}) },
      orderBy: { tier: "asc" },
      select: { tier: true },
    });
    for (const { tier } of tiers) {
      if (clock() > deadline) break;
      const sent = await ops.sendTier(db, { edition: rules.edition, tier, schedule, perIp: rules.tierGrantsPerIp, deadline }, input.pay);
      result.granted += sent.granted;
    }
  } catch (e) {
    console.error("[cron ennichi] paliers", e);
    result.errors.push("tiers");
  }

  // Cron de secours : la date de clôture est passée et l'équipe n'a pas tiré
  if (state.phase === "closing" && now >= schedule.closesAt && clock() < deadline) {
    try {
      await ops.draw(db, { staffId: null, rules, now, ...(await input.secrets()) });
      result.drawn = true;
    } catch (e) {
      // Tiré entre-temps par l'équipe (ALREADY_DRAWN) ou pas encore en clôture : rien d'anormal
      if (!(e instanceof EnnichiCloseError)) {
        console.error("[cron ennichi] tirage", e);
        result.errors.push("draw");
      }
    }
  }
  if ((state.phase === "closed" || result.drawn) && clock() < deadline) {
    try {
      result.paid = (await ops.payAwards(db, rules.edition, { ...input.pay, deadline })).paid;
    } catch (e) {
      console.error("[cron ennichi] prix", e);
      result.errors.push("awards");
    }
  }
  return result;
}
