import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { GuestBootstrap } from "@/components/GuestBootstrap";
import { OpeningStage } from "@/components/opening/OpeningStage";
import { PageShell } from "@/components/PageShell";
import { BOOSTERS, contentsLabel, isBoosterSlug } from "@/lib/boosters/catalog";
import { getBoosterRules } from "@/server/boosters/rules";
import { boosterStateFrom } from "@/server/boosters/state";
import { getCurrentUser } from "@/server/user";

export async function generateMetadata({ params }: PageProps<"/[locale]/ouvrir/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  if (!isBoosterSlug(slug)) return {};
  const t = await getTranslations("boosters");
  const tOpen = await getTranslations("opening");
  return { title: tOpen("title", { name: t(`types.${slug}.name`) }), robots: { index: false } };
}

export default async function OpenBoosterPage({ params }: PageProps<"/[locale]/ouvrir/[slug]">) {
  const { slug } = await params;
  if (!isBoosterSlug(slug)) notFound();

  const [t, tOpen, user, rules] = await Promise.all([
    getTranslations("boosters"),
    getTranslations("opening"),
    getCurrentUser(),
    getBoosterRules(),
  ]);

  if (!user) {
    return (
      <PageShell>
        <GuestBootstrap />
      </PageShell>
    );
  }

  const booster = BOOSTERS[slug];
  const name = t(`types.${slug}.name`);

  return (
    <PageShell>
      <h1 className="sr-only">{tOpen("title", { name })}</h1>
      <OpeningStage
        slug={slug}
        theme={booster.theme}
        name={name}
        tagline={t(`types.${slug}.tagline`)}
        contents={contentsLabel(rules.draw.slotFloors.length)}
        initialState={boosterStateFrom(user, rules)}
      />
    </PageShell>
  );
}
