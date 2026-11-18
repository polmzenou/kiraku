import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { hasYear } from "@/lib/wrapped/summary";
import { getAdmin } from "@/server/admin";
import { ogFonts, ogSeal, remoteImage } from "@/server/og/assets";
import { getCurrentUser } from "@/server/user";
import { getWrapped, getWrappedByUsername, getWrappedPhase } from "@/server/wrapped/queries";
import { renderWrappedStory } from "@/server/wrapped/story-image";
import { storyLabels } from "@/server/wrapped/story-labels";

// Image story du Wrapped (1080 × 1920) : privée, celle du joueur connecté seulement, pendant la période.
// L'admin peut voir celle de n'importe quel pseudo (?u=…), même Wrapped coupé : c'est l'aperçu de /admin/wrapped.

export const dynamic = "force-dynamic";

const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });

export async function GET(request: Request, { params }: RouteContext<"/[locale]/wrapped/image">) {
  const { locale: raw } = await params;
  const locale = hasLocale(routing.locales, raw) ? raw : routing.defaultLocale;
  const username = new URL(request.url).searchParams.get("u");
  const [{ settings, phase }, admin] = await Promise.all([getWrappedPhase(), getAdmin()]);
  if (!admin && (phase !== "open" || username)) return notFound();

  let summary;
  if (username && admin) {
    if (!/^[A-Za-z0-9_.-]{1,40}$/.test(username)) return notFound();
    summary = await getWrappedByUsername(username, settings.year);
  } else {
    const user = await getCurrentUser();
    if (!user || user.bannedAt) return notFound();
    summary = await getWrapped(user.id, settings.year);
  }
  if (!summary || !hasYear(summary)) return notFound();

  // Jamais l'illustration d'une carte spoil : l'image circule hors du jeu, sans le mode spoiler de qui la voit
  const [labels, fonts, seal, bestPullImage, favoriteImage] = await Promise.all([
    storyLabels(summary, locale),
    ogFonts(),
    ogSeal(),
    summary.bestPull && !summary.bestPull.spoiler ? remoteImage(summary.bestPull.imageUrl) : null,
    summary.favorite && !summary.favorite.spoiler ? remoteImage(summary.favorite.imageUrl) : null,
  ]);
  return renderWrappedStory(summary, labels, { fonts, seal, bestPullImage, favoriteImage }, {
    "Cache-Control": "private, max-age=300",
    "Content-Disposition": `inline; filename="kiraku-wrapped-${summary.year}.png"`,
  });
}
