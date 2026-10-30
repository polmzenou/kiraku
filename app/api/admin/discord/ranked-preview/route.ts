import { getAdmin } from "@/server/admin";
import { prisma } from "@/server/db";
import { rateLimit } from "@/server/ratelimit";
import { getRankedRules } from "@/server/ranked/queries";
import { captureSeasonSnapshot } from "@/server/ranked/snapshot";
import { seasonImage } from "@/server/discord/season-image";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  const admin = await getAdmin();
  if (!admin) return new Response(null, { status: 404 });
  if (!(await rateLimit(`ranked-image:${admin.id}`, { limit: 5, windowSeconds: 60 })).success) return new Response(null, { status: 429 });
  const [rules, season] = await Promise.all([
    getRankedRules(), prisma.season.findFirst({ where: { closedAt: null }, orderBy: { number: "desc" }, select: { number: true } }),
  ]);
  const snapshot = await captureSeasonSnapshot(prisma, season?.number ?? 1, new Date(), rules);
  const response = await seasonImage(snapshot, true, true);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
