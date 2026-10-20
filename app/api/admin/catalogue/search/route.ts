import { z } from "@/lib/zod";
import { normalizeSearch } from "@/lib/catalog/search";
import { getAdmin } from "@/server/admin";
import { prisma } from "@/server/db";
import { rateLimit } from "@/server/ratelimit";

// Recherche admin pour les sélecteurs de l'éditeur (série, carte de base d'une variante).
const schema = z.object({ kind: z.enum(["series", "card"]), q: z.string().trim().max(100) });
import type { SearchOption } from "@/lib/catalog/admin-list";

export async function GET(request: Request) {
  const admin = await getAdmin(); if (!admin) return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  // Les GET same-origin n'envoient pas toujours Origin : on s'appuie sur Fetch Metadata.
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  if (!(await rateLimit(`admin-catalog-search:${admin.id}`, { limit: 120, windowSeconds: 60 })).success) return Response.json({ error: "RATE_LIMITED" }, { status: 429 });
  const url = new URL(request.url);
  const parsed = schema.safeParse({ kind: url.searchParams.get("kind"), q: url.searchParams.get("q") ?? "" });
  if (!parsed.success) return Response.json({ error: "INVALID" }, { status: 400 });
  const { kind, q } = parsed.data;
  const terms = normalizeSearch(q).split(" ").filter(Boolean).slice(0, 6);
  if (kind === "series") {
    const rows = await prisma.series.findMany({
      where: { AND: terms.map((term) => ({ OR: [{ titleRomaji: { contains: term, mode: "insensitive" as const } }, { titleEnglish: { contains: term, mode: "insensitive" as const } }] })) },
      orderBy: { titleRomaji: "asc" }, take: 20, select: { id: true, titleRomaji: true, titleEnglish: true, type: true },
    });
    return Response.json(rows.map((s): SearchOption => ({ id: s.id, label: s.titleRomaji, detail: [s.titleEnglish, s.type].filter(Boolean).join(" · ") })));
  }
  // Seules les cartes « normales » peuvent servir de base : pas de chaîne de variantes.
  const rows = await prisma.card.findMany({
    where: { variantOfId: null, AND: terms.map((term) => ({ searchText: { contains: term } })) },
    orderBy: [{ status: "asc" }, { favorites: "desc" }, { name: "asc" }], take: 20,
    select: { id: true, name: true, rarity: true, imageUrl: true, publicId: true, series: { select: { titleRomaji: true } } },
  });
  return Response.json(rows.map((c): SearchOption => ({ id: c.id, label: c.name, detail: `${c.series.titleRomaji} · #${c.publicId}`, imageUrl: c.imageUrl || undefined })));
}
