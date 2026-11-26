import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CasinoHall } from "@/components/casino/CasinoHall";
import { CeremonyGate } from "@/components/casino/CeremonyGate";
import { EventGauge } from "@/components/home/EventGauge";
import { CasinoTeaser } from "@/components/casino/CasinoTeaser";
import { PreviewBanner } from "@/components/casino/PreviewBanner";
import { PageShell } from "@/components/PageShell";
import { casinoPulse, casinoView, recentFlips } from "@/server/casino/queries";
import { getLocale } from "next-intl/server";
import { getEventGauge } from "@/server/home/event-gauge";
import { getSetting } from "@/server/settings";
import { getCurrentUser } from "@/server/user";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("casino");
  return { title: t("title"), description: t("description"), robots: { index: false, follow: true } };
}

/** Casino : teaser avant l'ouverture (l'équipe voit le hall en aperçu), puis le hall et ses jeux. */
export default async function CasinoPage() {
  const user = await getCurrentUser();
  const view = await casinoView(user?.role);
  if (!view.access.canEnter) {
    return (
      <PageShell>
        <CasinoTeaser opensAt={view.rules.opensAt} serverNow={view.serverNow} />
      </PageShell>
    );
  }
  const locale = await getLocale();
  const { coinflip } = view.rules;
  const [pulse, feed, gauge, gaugeRefresh] = await Promise.all([
    casinoPulse(),
    recentFlips(locale, coinflip),
    getEventGauge(view.serverNow),
    getSetting("home.eventGauge.refreshSeconds"),
  ]);
  // Inauguration : la jauge des lancers suit dans le hall (celle des boosters reste sur l'accueil)
  const flipsGauge = gauge?.metric === "COINFLIPS" ? gauge : null;
  return (
    <PageShell>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        {view.access.preview && <PreviewBanner phase={view.access.phase} />}
        {/* Cérémonie d'ouverture : une fois par appareil, pendant les jours qui suivent l'ouverture */}
        <CeremonyGate due={view.access.phase === "open" && view.launching} />
        <CasinoHall
          pulse={pulse}
          feed={feed}
          feedRefreshSeconds={coinflip.lobbyPollSeconds}
          serverNow={view.serverNow}
          isNew={view.launching}
          gauge={flipsGauge && <EventGauge key={flipsGauge.phase} initial={flipsGauge} refreshSeconds={gaugeRefresh} serverNow={view.serverNow} cta={null} compact />}
        />
      </div>
    </PageShell>
  );
}
