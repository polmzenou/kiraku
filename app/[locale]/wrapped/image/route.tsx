import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { isFrozen } from "@/lib/account/deletion";
import { hasYear } from "@/lib/wrapped/summary";
import { getAdmin } from "@/server/admin";
import { ogFonts, ogSeal, remoteImage } from "@/server/og/assets";
import { rateLimit } from "@/server/ratelimit";
import { getCurrentUser } from "@/server/user";
import { getWrapped, getWrappedByUsername, getWrappedPhase } from "@/server/wrapped/queries";
import { renderWrappedStory } from "@/server/wrapped/story-image";
import { storyLabels } from "@/server/wrapped/story-labels";

// Image story du Wrapped (1080 × 1920) : privée, celle du joueur connecté seulement, pendant la période.
// L'admin peut voir celle de n'importe quel pseudo (?u=…), même Wrapped coupé : c'est l'aperçu de /admin/wrapped.

export const dynamic = "force-dynamic";

/**
 * Rendus par joueur et par minute : l'image est dessinée à chaque appel (polices, illustrations, PNG), et le
 * navigateur la garde cinq minutes. L'écran de fin l'affiche, la partage et la télécharge : bien en dessous.
 */
const RENDERS_PER_MINUTE = 10;

const refuse = (status: 404 | 429) =>
  new Response(status === 404 ? "Not found" : "Too many requests", { status, headers: { "Cache-Control": "private, no-store" } });
const notFound = () => refuse(404);

export async function GET(request: Request, { params }: RouteContext<"/[locale]/wrapped/image">) {
  const { locale: raw } = await params;
  const locale = hasLocale(routing.locales, raw) ? raw : routing.defaultLocale;
  const username = new URL(request.url).searchParams.get("u");
  const [{ settings, phase }, admin] = await Promise.all([getWrappedPhase(), getAdmin()]);
  if (!admin && (phase !== "open" || username)) return notFound();

  let summary;
  let requester: string;
  if (username && admin) {
    if (!/^[A-Za-z0-9_.-]{1,40}$/.test(username)) return notFound();
    requester = admin.id;
    summary = await getWrappedByUsername(username, settings.year);
  } else {
    const user = await getCurrentUser();
    // Mêmes refus que la page /wrapped : ni banni ni compte gelé
    if (!user || user.bannedAt || isFrozen(user)) return notFound();
    requester = user.id;
    summary = await getWrapped(user.id, settings.year);
  }
  if (!summary || !hasYear(summary)) return notFound();
  if (!(await rateLimit(`wrapped-image:${requester}`, { limit: RENDERS_PER_MINUTE, windowSeconds: 60 })).success) return refuse(429);

  // Jamais l'illustration d'une carte spoil : l'image circule hors du jeu, sans le mode spoiler de qui la voit
  const [labels, fonts, seal, bestPullImage, favoriteImage] = await Promise.all([
    storyLabels(summary, locale),
    ogFonts(),
    ogSeal(),
    // WebP converti et teinte Gold appliquée comme sur le site (server/og/assets.ts)
    summary.bestPull && !summary.bestPull.spoiler ? remoteImage(summary.bestPull.imageUrl, 5_000, { gold: summary.bestPull.gold }) : null,
    summary.favorite && !summary.favorite.spoiler ? remoteImage(summary.favorite.imageUrl, 5_000, { gold: summary.favorite.gold }) : null,
  ]);
  return renderWrappedStory(summary, labels, { fonts, seal, bestPullImage, favoriteImage }, {
    // Même adresse pour tous les joueurs : le cache du navigateur dépend de la session (un autre compte connecté
    // ensuite sur l'appareil ne reçoit pas l'image du précédent)
    "Cache-Control": "private, max-age=300",
    Vary: "Cookie",
    "Content-Disposition": `inline; filename="kiraku-wrapped-${summary.year}.png"`,
  });
}
