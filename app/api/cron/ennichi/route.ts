import { cronAuthorized } from "@/server/cron-auth";
import { prisma } from "@/server/db";
import { drawEnnichiWith, EnnichiCloseError, payAwardsWith } from "@/server/ennichi/close-core";
import { ennichiPayDeps, ennichiState } from "@/server/ennichi/deps";
import { lanternCountsWith, recordReachedTiersWith, sendTierWith } from "@/server/ennichi/lanterns-core";

// Ennichi (étape 18d), toutes les 5 minutes sur le VPS (deploy/crontab.example) :
//   - pendant la fête et la clôture, les paliers de lanternes atteints se figent puis leur lot part, par lots, à chaque
//     joueur éligible (le rattrapage à l'ouverture d'un booster sert ceux qui le deviennent ensuite) ;
//   - à la date de clôture, si l'équipe n'a pas lancé « Arrêter et tirer », le tirage se fait tout seul ;
//   - après le tirage, les prix pas encore versés le sont (relancé sans risque : chacun n'est versé qu'une fois).
// Sans effet tant que ennichi.enabled est coupé.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!cronAuthorized(request.headers.get("authorization"))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const now = new Date();
  const deadline = Date.now() + 50_000;
  const state = await ennichiState(now);
  if (state.phase === "off" || !state.schedule) return Response.json({ enabled: state.rules.enabled, phase: state.phase });
  const { rules, schedule } = state;
  const deps = ennichiPayDeps(now);
  const result = { phase: state.phase, lit: 0, reached: [] as number[], granted: 0, drawn: false, paid: 0 };

  // Trois étapes isolées : une erreur dans l'une (versement impossible, panne) n'empêche pas les suivantes
  const errors: string[] = [];
  try {
    if (state.phase === "live" || state.phase === "closing") {
      const { lit } = await lanternCountsWith(prisma, rules.edition, now < schedule.closesAt ? now : schedule.closesAt);
      result.lit = lit;
      result.reached = await recordReachedTiersWith(prisma, rules, lit, now);
    }
    // Paliers atteints : pendant la fête et la clôture, tous à chaque passage (un joueur devenu éligible après la fin
    // d'un envoi est servi même s'il n'ouvre plus de booster) ; après le tirage, les envois pas encore finis continuent
    const tiers = await prisma.ennichiTierReached.findMany({
      where: { edition: rules.edition, ...(state.phase === "closed" ? { finishedAt: null } : {}) },
      orderBy: { tier: "asc" },
      select: { tier: true },
    });
    for (const { tier } of tiers) {
      if (Date.now() > deadline) break;
      const sent = await sendTierWith(prisma, { edition: rules.edition, tier, schedule, perIp: rules.tierGrantsPerIp, deadline }, deps);
      result.granted += sent.granted;
    }
  } catch (e) {
    console.error("[cron ennichi] paliers", e);
    errors.push("tiers");
  }

  // Cron de secours : la date de clôture est passée et l'équipe n'a pas tiré
  if (state.phase === "closing" && now >= schedule.closesAt && Date.now() < deadline) {
    try {
      await drawEnnichiWith(prisma, { staffId: null, rules, now });
      result.drawn = true;
    } catch (e) {
      if (!(e instanceof EnnichiCloseError)) {
        console.error("[cron ennichi] tirage", e);
        errors.push("draw");
      }
    }
  }
  if ((state.phase === "closed" || result.drawn) && Date.now() < deadline) {
    try {
      result.paid = (await payAwardsWith(prisma, rules.edition, { ...deps, deadline })).paid;
    } catch (e) {
      console.error("[cron ennichi] prix", e);
      errors.push("awards");
    }
  }
  return Response.json({ ...result, errors }, { status: errors.length ? 500 : 200 });
}
