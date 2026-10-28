import { exportFileName } from "@/lib/account/export";
import { collectExportWith } from "@/server/account/export-core";
import { prisma } from "@/server/db";
import { rateLimit } from "@/server/ratelimit";
import { isSameOrigin } from "@/server/same-origin";
import { getSetting } from "@/server/settings";
import { getCurrentUser } from "@/server/user";

// « Télécharger mes données » (droit d'accès et de portabilité) : un formulaire POST de la page
// Mes données. POST seulement, origine vérifiée (pas de CSRF), le joueur de la session uniquement.

export const dynamic = "force-dynamic";

const DAY = 86_400;

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "forbidden" }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const perDay = await getSetting("account.exportsPerDay");
  if (!(await rateLimit(`export:${user.id}`, { limit: perDay, windowSeconds: DAY })).success) {
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }

  const now = new Date();
  const data = await collectExportWith(prisma, user.id, now);
  if (!data) return Response.json({ error: "unauthorized" }, { status: 401 });
  await prisma.dataRequest.create({
    data: { userId: user.id, kind: "EXPORT", status: "DONE", requestedAt: now, processedAt: now },
  });

  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFileName(now)}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
