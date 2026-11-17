import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CasinoHall } from "@/components/casino/CasinoHall";
import { CasinoTeaser } from "@/components/casino/CasinoTeaser";
import { PreviewBanner } from "@/components/casino/PreviewBanner";
import { PageShell } from "@/components/PageShell";
import { casinoPulse, casinoView, recentFlips } from "@/server/casino/queries";
import { getLocale } from "next-intl/server";
import { getCurrentUser } from "@/server/user";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("casino");
  return { title: t("title"), description: t("description"), robots: { index: false, follow: true } };
}

// Gros lancers mis en avant dans le fil (le relais Discord a son propre seuil)
const FEED_BIG_FROM = "LEGENDARY";

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
  const [pulse, feed] = await Promise.all([
    casinoPulse(),
    recentFlips({ locale, size: coinflip.feedSize, maxAgeHours: coinflip.feedMaxAgeHours, bigFrom: FEED_BIG_FROM }),
  ]);
  return (
    <PageShell>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        {view.access.preview && <PreviewBanner phase={view.access.phase} />}
        <CasinoHall pulse={pulse} feed={feed} feedRefreshSeconds={coinflip.lobbyPollSeconds} serverNow={view.serverNow} isNew={view.launching} />
      </div>
    </PageShell>
  );
}
