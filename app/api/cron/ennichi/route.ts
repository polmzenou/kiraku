import { cronAuthorized } from "@/server/cron-auth";
import { prisma } from "@/server/db";
import { runEnnichiCronWith } from "@/server/ennichi/cron-core";
import { ennichiDrawSecrets, ennichiPayDeps, ennichiState } from "@/server/ennichi/deps";

// Ennichi (étape 18d), toutes les 5 minutes sur le VPS (deploy/crontab.example) : paliers de lanternes, tirage de
// secours à la date de clôture, prix du tirage (détail dans server/ennichi/cron-core.ts). Sans effet tant que
// ennichi.enabled est coupé.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!cronAuthorized(request.headers.get("authorization"))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const now = new Date();
  const state = await ennichiState(now);
  if (state.phase === "off" || !state.schedule) return Response.json({ enabled: state.rules.enabled, phase: state.phase });
  const result = await runEnnichiCronWith(prisma, {
    state,
    now,
    clock: Date.now,
    // 50 secondes en tout depuis l'appel (maxDuration 60)
    budgetMs: 50_000 - (Date.now() - now.getTime()),
    pay: ennichiPayDeps(now),
    secrets: ennichiDrawSecrets,
  });
  return Response.json(result, { status: result.errors.length ? 500 : 200 });
}
