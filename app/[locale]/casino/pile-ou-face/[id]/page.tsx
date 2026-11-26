import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { GuestBootstrap } from "@/components/GuestBootstrap";
import { CoinFlipTable } from "@/components/casino/CoinFlipTable";
import { PreviewBanner } from "@/components/casino/PreviewBanner";
import { PageShell } from "@/components/PageShell";
import { redirect } from "@/i18n/navigation";
import { isFrozen } from "@/lib/account/deletion";
import type { CasinoActionError } from "@/server/actions/casino";
import { sweepCasinoWith } from "@/server/casino/coinflip-core";
import { playBlockFor } from "@/server/casino/deps";
import { casinoView, getTable, joinableRarities } from "@/server/casino/queries";
import { namedPlayerSelect, publicNamesFor } from "@/server/collection/public-names";
import { prisma } from "@/server/db";
import { pushLater } from "@/server/push/send";
import { getCurrentUser } from "@/server/user";

const ID = /^[A-Za-z0-9_-]{1,40}$/;

export async function generateMetadata({ params }: PageProps<"/[locale]/casino/pile-ou-face/[id]">): Promise<Metadata> {
  const { id } = await params;
  const t = await getTranslations("casino");
  const row = ID.test(id) ? await prisma.coinFlip.findUnique({ where: { id }, select: { creator: { select: namedPlayerSelect } } }) : null;
  // Titre vu dans l'aperçu d'un lien partagé : pseudo masqué comme ailleurs si le profil du créateur le cache
  const name = row ? (await publicNamesFor(null, [row.creator]))(row.creator).name : null;
  // Page partageable (lien d'invitation), jamais indexée
  return { title: name ? t("table.tableOf", { name }) : t("salon.title"), robots: { index: false, follow: false } };
}

/** Une table : attente, relève, lancer, résultat et vérification du tirage. */
export default async function CoinFlipTablePage({ params }: PageProps<"/[locale]/casino/pile-ou-face/[id]">) {
  const [{ id }, user, locale] = await Promise.all([params, getCurrentUser(), getLocale()]);
  if (!user) {
    return (
      <PageShell>
        <GuestBootstrap />
      </PageShell>
    );
  }
  const view = await casinoView(user.role);
  if (!view.access.canEnter) return redirect({ href: "/casino", locale });
  if (!ID.test(id)) notFound();

  let table = await getTable(id, user.id, locale);
  if (!table) notFound();
  // Table échue pas encore balayée : la carte revient à son créateur avant l'affichage
  if (table.status === "OPEN" && Date.parse(table.expiresAt) <= view.serverNow) {
    await sweepCasinoWith(prisma, { now: new Date(view.serverNow) }, { creatorId: table.creatorId }, pushLater).catch((e) => console.error("[casino] balayage à l'affichage", e));
    table = (await getTable(id, user.id, locale)) ?? table;
  }

  const member = !user.isGuest && !user.bannedAt && !isFrozen(user);
  let joinBlock: CasinoActionError | null = null;
  if (table.status === "OPEN" && !table.mine) {
    if (user.isGuest) joinBlock = "GUEST";
    else if (!member) joinBlock = user.bannedAt ? "BANNED" : "UNAVAILABLE";
    else if (!view.rules.coinflip.enabled) joinBlock = "DISABLED";
    else if (table.reservedForId !== null && table.reservedForId !== user.id) joinBlock = "RESERVED";
    // Refus déjà connus (compte trop récent, verrou du parrainage, lancers du jour) : dits avant le choix de la fuda
    else joinBlock = await playBlockFor(user, { counterpartyId: table.creatorId, creating: false }, new Date(view.serverNow));
  }
  const joinRarities = table.status === "OPEN" && !table.mine ? await joinableRarities(table.tierOrder) : [];
  if (joinBlock === null && table.status === "OPEN" && !table.mine && joinRarities.length === 0) joinBlock = "RARITY";

  return (
    <PageShell>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        {view.access.preview && <PreviewBanner phase={view.access.phase} />}
        <CoinFlipTable
          initial={table}
          viewerId={user.id}
          canJoin={joinBlock === null && table.status === "OPEN" && !table.mine}
          joinBlock={joinBlock}
          joinRarities={joinRarities}
          pollSeconds={view.rules.coinflip.tablePollSeconds}
          serverNow={view.serverNow}
        />
      </div>
    </PageShell>
  );
}
