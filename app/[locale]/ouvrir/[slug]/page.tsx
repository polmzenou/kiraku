import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import dynamic from "next/dynamic";
import { notFound } from "next/navigation";
import { GuestBootstrap } from "@/components/GuestBootstrap";
import { PageShell } from "@/components/PageShell";
import { contentsLabel } from "@/lib/boosters/catalog";
import { effectiveSlotFloors, localize, SLUG_PATTERN } from "@/lib/boosters/types";
import { readBannerPity } from "@/server/boosters/open-core";
import { getBoosterOffers } from "@/server/boosters/pools";
import { getBoosterRules } from "@/server/boosters/rules";
import { boosterStateFrom } from "@/server/boosters/state";
import { getCurrentUser } from "@/server/user";

// La scène d'ouverture (Motion complet, gestes, sons) n'est chargée que sur cette page
const OpeningStage = dynamic(() => import("@/components/opening/OpeningStage").then((m) => m.OpeningStage));

async function loadOffer(slug: string) {
  if (!SLUG_PATTERN.test(slug)) return null;
  const offer = (await getBoosterOffers()).find((o) => o.type.slug === slug);
  return offer && offer.availability !== "hidden" ? offer : null;
}

export async function generateMetadata({ params }: PageProps<"/[locale]/ouvrir/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const offer = await loadOffer(slug);
  if (!offer) return {};
  const [t, locale] = await Promise.all([getTranslations("opening"), getLocale()]);
  return { title: t("title", { name: localize(offer.type.name, locale) }), robots: { index: false } };
}

export default async function OpenBoosterPage({ params }: PageProps<"/[locale]/ouvrir/[slug]">) {
  const { slug } = await params;
  const offer = await loadOffer(slug);
  if (!offer) notFound();

  const [t, user, rules, locale] = await Promise.all([
    getTranslations("opening"),
    getCurrentUser(),
    getBoosterRules(),
    getLocale(),
  ]);

  if (!user) {
    return (
      <PageShell>
        <GuestBootstrap />
      </PageShell>
    );
  }

  const { type } = offer;
  const name = localize(type.name, locale);
  const cards = effectiveSlotFloors(type.slotFloors, rules.draw.slotFloors).length;
  const bannerPity = readBannerPity(user.bannerPity);

  return (
    <PageShell>
      <h1 className="sr-only">{t("title", { name })}</h1>
      <OpeningStage
        type={{
          slug: type.slug,
          shape: type.shape,
          theme: type.theme,
          emblem: type.emblem,
          name,
          tagline: localize(type.tagline, locale),
          cards,
          contents: contentsLabel(cards),
          // Réservé aux événements : rien à ouvrir ici
          usesFreeStock: type.usesFreeStock,
          priceZeni: offer.availability === "locked" ? null : type.priceZeni,
          countsForPity: type.countsForPity,
          bonusEligible: type.bonusEligible,
          featured:
            type.featuredCardIds.length > 0 && type.featuredPity > 0
              ? { threshold: type.featuredPity, count: bannerPity[type.id] ?? 0 }
              : null,
        }}
        initialState={boosterStateFrom(user, rules)}
      />
    </PageShell>
  );
}
