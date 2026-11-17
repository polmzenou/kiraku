import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { GuestBootstrap } from "@/components/GuestBootstrap";
import { CoinFlipSalon } from "@/components/casino/CoinFlipSalon";
import { PreviewBanner } from "@/components/casino/PreviewBanner";
import { PageShell } from "@/components/PageShell";
import { redirect } from "@/i18n/navigation";
import { isFrozen } from "@/lib/account/deletion";
import { parseSalonParams } from "@/lib/casino/params";
import { casinoTiers } from "@/lib/casino/tiers";
import { getRarityDefinitions } from "@/server/catalog/rarities";
import { casinoView, listHistory, listLobby, listMyTables } from "@/server/casino/queries";
import { prisma } from "@/server/db";
import { getCurrentUser } from "@/server/user";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("casino");
  return { title: t("salon.title"), robots: { index: false, follow: false } };
}

/** Salon du pile ou face : tables ouvertes, mes tables et invitations, historique ; « Poser une carte ». */
export default async function CoinFlipSalonPage({ searchParams }: PageProps<"/[locale]/casino/pile-ou-face">) {
  const [user, locale] = await Promise.all([getCurrentUser(), getLocale()]);
  if (!user) {
    return (
      <PageShell>
        <GuestBootstrap />
      </PageShell>
    );
  }
  const view = await casinoView(user.role);
  if (!view.access.canEnter) return redirect({ href: "/casino", locale });

  const { rules } = view;
  const definitions = await getRarityDefinitions();
  const tiers = casinoTiers(definitions, rules.coinflip.allowedRarities).map((x) => ({ ...x, key: x.rarities[0] }));
  const params = parseSalonParams(await searchParams, tiers.map((x) => x.key));
  const member = !user.isGuest && !user.bannedAt && !isFrozen(user);
  const tab = member ? params.tab : "tables";
  const tierOrder = tiers.find((x) => x.key === params.tier)?.order ?? null;

  // Revanche : l'adversaire d'une table jouée par le joueur devient la réservation proposée
  let reserveFor = params.reserveFor;
  if (params.rematchOf && member) {
    const past = await prisma.coinFlip.findFirst({
      where: { id: params.rematchOf, status: "DONE", OR: [{ creatorId: user.id }, { opponentId: user.id }] },
      select: { creatorId: true, creator: { select: { username: true } }, opponent: { select: { username: true } } },
    });
    if (past) reserveFor = (past.creatorId === user.id ? past.opponent?.username : past.creator.username) ?? null;
  }

  const [lobby, mine, history] = await Promise.all([
    tab === "tables" ? listLobby({ viewerId: user.id, tier: tierOrder, cursor: null, locale }) : null,
    tab === "mes-tables" ? listMyTables(user.id, locale) : null,
    tab === "historique" ? listHistory(user.id, locale) : null,
  ]);

  return (
    <PageShell>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        {view.access.preview && <PreviewBanner phase={view.access.phase} />}
        <CoinFlipSalon
          tab={tab}
          tiers={tiers}
          tier={params.tier}
          lobby={lobby}
          mine={mine}
          history={history}
          canPlay={member && rules.coinflip.enabled}
          allowed={rules.coinflip.allowedRarities}
          expiryHours={rules.coinflip.expiryHours}
          pollSeconds={rules.coinflip.lobbyPollSeconds}
          reserveFor={member ? reserveFor : null}
          serverNow={view.serverNow}
        />
      </div>
    </PageShell>
  );
}
