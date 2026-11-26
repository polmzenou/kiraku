import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { GuestBootstrap } from "@/components/GuestBootstrap";
import { PageShell } from "@/components/PageShell";
import { SectionTitle } from "@/components/SectionTitle";
import { SpoilerToggle } from "@/components/SpoilerToggle";
import { SpoilerUniverseList } from "@/components/spoiler/SpoilerUniverseList";
import { getSpoilerUniverses } from "@/server/catalog/spoiler-universes";
import { getCurrentUser } from "@/server/user";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Mode spoiler par univers : tout est flouté par défaut, le joueur remet en clair les univers qu'il a rattrapés. */
export default async function SpoilerSettingsPage() {
  const locale = await getLocale();
  const [t, user, universes] = await Promise.all([getTranslations("spoiler.universes"), getCurrentUser(), getSpoilerUniverses(locale)]);
  if (!user) {
    return (
      <PageShell>
        <GuestBootstrap />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <SectionTitle level={1} kanji="秘" title={t("title")} subtitle={t("intro")} />
      <section className="flex flex-col gap-5 lacquer rounded-card p-4">
        <SpoilerToggle />
      </section>
      <SpoilerUniverseList universes={universes} />
    </PageShell>
  );
}
