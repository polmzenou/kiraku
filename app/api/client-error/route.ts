import { clientErrorSchema } from "@/lib/errors/client-report";
import { clientIp, rateLimit } from "@/server/ratelimit";
import { isSameOrigin } from "@/server/same-origin";
import { getCurrentUser } from "@/server/user";

// Erreurs du navigateur (pages d'erreur de l'app, lib/errors/client-report.ts) écrites dans les logs du
// serveur (pm2), pour voir enfin ce qui plante chez un joueur. Rien en base. Origine vérifiée, débit limité
// par IP, corps borné et validé par Zod ; le joueur connecté est nommé pour recouper avec ses signalements.

export const dynamic = "force-dynamic";

const MAX_BODY = 12_000;
const empty = (status: number) => new Response(null, { status });
// Texte venu du navigateur (donc falsifiable) : sur une ligne, sans caractère de contrôle, pour qu'un faux
// rapport ne puisse pas imiter une autre ligne des logs
const oneLine = (text: string) => text.replace(/[\u0000-\u001f\u007f]+/g, " ");

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return empty(403);
  const ip = await clientIp();
  // Une page qui plante en boucle n'inonde pas les logs
  if (!(await rateLimit(`client-error:${ip}`, { limit: 10, windowSeconds: 600 }, { store: "memory" })).success) return empty(429);
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
  const agent = oneLine((request.headers.get("user-agent") ?? "inconnu").slice(0, 300));
  const stack = (report.stack ?? "")
    .split(/\r?\n/)
    .slice(0, 25)
    .filter((line) => line.trim())
    .map((line) => `    ${oneLine(line.trim())}`);
  console.error(
    [
      `[erreur navigateur] ${report.boundary} ${oneLine(report.path)} · ${oneLine(report.name)}: ${oneLine(report.message)}` +
        `${report.digest ? ` · digest ${oneLine(report.digest)}` : ""} · ${who} · ${agent}`,
      ...stack,
    ].join("\n"),
  );
  return empty(204);
}
