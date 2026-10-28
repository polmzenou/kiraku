import { prisma } from "@/server/db";
import { clientIp, rateLimit } from "@/server/ratelimit";

// Sonde pour un moniteur externe (UptimeRobot, Better Stack) : la base répond-elle ?
// Réponse volontairement muette : aucun détail d'erreur, de version ni de configuration.

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const TIMEOUT_MS = 3_000;

export async function GET() {
  if (!(await rateLimit(`health:${await clientIp()}`, { limit: 30, windowSeconds: 60 }, { store: "memory" })).success) {
    return Response.json({ ok: false }, { status: 429, headers: NO_STORE });
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS);
      }),
    ]);
    return Response.json({ ok: true }, { headers: NO_STORE });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: NO_STORE });
  } finally {
    clearTimeout(timer);
  }
}
