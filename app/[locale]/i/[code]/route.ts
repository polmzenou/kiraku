import { NextResponse, type NextRequest } from "next/server";
import { getPathname } from "@/i18n/navigation";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { normalizeReferralCode } from "@/lib/economy/referral";
import { REFERRAL_COOKIE } from "@/server/economy/referral";

/**
 * Lien d'invitation /i/[code] : retient le code sur l'appareil (cookie httpOnly, 30 jours) et
 * renvoie vers la page de parrainage. Rien n'est écrit en base : le rattachement se fait quand
 * l'invité crée son compte.
 */
export async function GET(request: NextRequest, { params }: RouteContext<"/[locale]/i/[code]">) {
  const { locale: raw, code: rawCode } = await params;
  const locale = hasLocale(routing.locales, raw) ? raw : routing.defaultLocale;
  const code = normalizeReferralCode(decodeURIComponent(rawCode));
  const target = new URL(getPathname({ href: "/parrainage", locale }), request.nextUrl.origin);
  const response = NextResponse.redirect(target, 303);
  if (code) {
    response.cookies.set(REFERRAL_COOKIE.name, code, { ...REFERRAL_COOKIE.options, maxAge: REFERRAL_COOKIE.maxAge });
  }
  return response;
}
