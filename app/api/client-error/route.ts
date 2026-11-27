import { clientErrorSchema, logLine } from "@/lib/errors/client-report";
import { clientNetworkKey, rateLimit } from "@/server/ratelimit";
import { isSameOrigin } from "@/server/same-origin";
import { getCurrentUser } from "@/server/user";

// Erreurs du navigateur (pages d'erreur de l'app, lib/errors/client-report.ts) écrites dans les logs du
// serveur (pm2), pour voir enfin ce qui plante chez un joueur. Rien en base. Origine vérifiée, débit limité
// par IP, corps borné et validé par Zod ; le joueur connecté est nommé pour recouper avec ses signalements.

export const dynamic = "force-dynamic";

const MAX_BODY = 12_000;
const empty = (status: number) => new Response(null, { status });

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return empty(403);
  // Une page qui plante en boucle n'inonde pas les logs (une IPv6 par son /64)
  if (!(await rateLimit(`client-error:${await clientNetworkKey()}`, { limit: 10, windowSeconds: 600 }, { store: "memory" })).success) return empty(429);
  // Taille annoncée refusée avant toute lecture (en octets : 3 au plus par caractère en UTF-8) ; le contrôle après
  // lecture couvre un envoi sans Content-Length
  if (Number(request.headers.get("content-length")) > MAX_BODY * 3) return empty(413);
  const body = await request.text();
  if (body.length > MAX_BODY) return empty(413);
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return empty(400);
  }
  const parsed = clientErrorSchema.safeParse(raw);
  if (!parsed.success) return empty(400);

  const report = parsed.data;
  const user = await getCurrentUser().catch(() => null);
  const who = user ? `${user.username}${user.isGuest ? " (invité)" : ""}` : "sans session";
  const agent = logLine((request.headers.get("user-agent") ?? "inconnu").slice(0, 300));
  const stack = (report.stack ?? "")
    .split(/\r?\n/)
    .slice(0, 25)
    .filter((line) => line.trim())
    .map((line) => `    ${logLine(line.trim())}`);
  console.error(
    [
      `[erreur navigateur] ${report.boundary} ${logLine(report.path)} · ${logLine(report.name)}: ${logLine(report.message)}` +
        `${report.digest ? ` · digest ${logLine(report.digest)}` : ""} · ${who} · ${agent}`,
      ...stack,
    ].join("\n"),
  );
  return empty(204);
}
