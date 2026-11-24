import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { InviteLetter, InviteRegistered, InviteUnknown } from "@/components/referral/InviteLanding";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { parseInviteCode } from "@/lib/referral/codes";
import { baseOpenGraph, OG_IMAGE_SIZE, ogImageUrl } from "@/lib/seo/open-graph";
import { prisma } from "@/server/db";
import { referrerByCode } from "@/server/og/data";
import { referralV2Rules } from "@/server/referral/deps";
import { referralGifts } from "@/server/referral/queries";
import { getSetting } from "@/server/settings";
import { getCurrentUser } from "@/server/user";
import { ennichiInviteMultiplier } from "@/server/ennichi/hooks";

// Lien d'invitation /i/CODE (code standard ou code perso). Le code est déjà gardé sur l'appareil par proxy.ts ; rien
// n'est écrit en base avant l'inscription. Parrainage v2 : page d'arrivée (lettre du parrain et cadeau de bienvenue) ;
// v1 : la page de parrainage, comme avant. Aperçu « Pseudo t'invite sur Kiraku » pour Discord, WhatsApp… Jamais indexée.

const codeOf = (raw: string) => {
  try {
    return parseInviteCode(decodeURIComponent(raw))?.code ?? null;
  } catch {
    return null;
  }
};

export async function generateMetadata({ params }: PageProps<"/[locale]/i/[code]">): Promise<Metadata> {
  const { locale: raw, code: rawCode } = await params;
  const robots = { index: false, follow: false };
  const code = codeOf(rawCode);
  if (!code) return { robots };
  const locale = hasLocale(routing.locales, raw) ? raw : routing.defaultLocale;
  const [t, referrer] = await Promise.all([getTranslations({ locale, namespace: "invite" }), referrerByCode(code).catch(() => null)]);
  const title = referrer ? t("metaTitle", { name: referrer.username }) : t("metaTitleGeneric");
  const description = t("metaDescription");
  const image = { url: ogImageUrl(locale, `/og-image/parrainage/${code}`), ...OG_IMAGE_SIZE, alt: title };
  return {
    robots,
    title: { absolute: title },
    description,
    openGraph: { ...baseOpenGraph(locale), title, description, images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}

/** Premier booster ouvert par un invité : le booster standard gratuit le plus mis en avant, sinon l'accueil. */
async function firstBoosterHref(): Promise<string> {
  const type = await prisma.boosterType.findFirst({
    where: { active: true, usesFreeStock: true, family: "standard" },
    orderBy: { sortOrder: "asc" },
    select: { slug: true },
  });
  return type ? `/ouvrir/${type.slug}` : "/";
}

export default async function InvitePage({ params }: PageProps<"/[locale]/i/[code]">) {
  const { code: rawCode } = await params;
  const code = codeOf(rawCode);
  const [locale, v2] = await Promise.all([getLocale(), getSetting("referral.v2.enabled")]);
  if (!v2) redirect({ href: code ? { pathname: "/parrainage", query: { parrain: code } } : "/parrainage", locale });

  const [referrer, user] = await Promise.all([code ? referrerByCode(code).catch(() => null) : null, getCurrentUser()]);
  if (!referrer) return <InviteUnknown />;
  if (user && !user.isGuest) return <InviteRegistered referrer={referrer.username} />;

  const rules = await referralV2Rules();
  const [{ steps }, openHref] = await Promise.all([referralGifts(rules, locale, 0), firstBoosterHref()]);
  // Ennichi : le cadeau des étapes 1 et 2 est multiplié pendant la fête (lot 18d)
  return <InviteLetter referrer={referrer.username} lot={steps[0]?.referee ?? null} multiplier={await ennichiInviteMultiplier()} openHref={openHref} />;
}
