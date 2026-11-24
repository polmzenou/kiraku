import "server-only";
import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { parseInviteCode } from "@/lib/referral/codes";
import { baseOpenGraph, OG_IMAGE_SIZE, ogImageUrl } from "@/lib/seo/open-graph";
import { referrerByCode } from "../og/data";

/**
 * Aperçu d'une page partagée avec le code d'un parrain (?ref=CODE : tirage, profil, vitrine) : l'image de l'invitation
 * (enveloppe, cadeau de bienvenue) à la place de l'image habituelle, avec le titre et la description de la page.
 * null sans code valable ou parrain disponible : la page garde son aperçu.
 */
export async function referralPreview(ref: unknown, locale: Locale, title: string, description: string): Promise<Pick<Metadata, "openGraph" | "twitter"> | null> {
  const raw = Array.isArray(ref) ? ref[0] : ref;
  const code = typeof raw === "string" ? (parseInviteCode(raw)?.code ?? null) : null;
  if (!code) return null;
  const referrer = await referrerByCode(code).catch(() => null);
  if (!referrer) return null;
  const image = { url: ogImageUrl(locale, `/og-image/parrainage/${code}`), ...OG_IMAGE_SIZE, alt: title };
  return {
    openGraph: { ...baseOpenGraph(locale), title, description, images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}
