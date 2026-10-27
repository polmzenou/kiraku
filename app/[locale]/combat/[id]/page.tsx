import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { BattleScreen } from "@/components/battle/BattleScreen";
import { GuestBootstrap } from "@/components/GuestBootstrap";
import { routing } from "@/i18n/routing";
import { parseBoardTier } from "@/lib/battle/tiers";
import { battleCtx, getBattleView, getCandidates, getLastTeam, sweepBattlesFor } from "@/server/battle/queries";
import { getCurrentUser } from "@/server/user";

export async function generateMetadata({ params }: PageProps<"/[locale]/combat/[id]">): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = hasLocale(routing.locales, raw) ? raw : routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: "battle" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

const ID = /^[A-Za-z0-9_-]{1,40}$/;

/** Une partie : visible de ses deux joueurs seulement (et de l'invité d'une salle réservée). */
export default async function BattlePage({ params, searchParams }: PageProps<"/[locale]/combat/[id]">) {
  const { id } = await params;
  const { rang } = await searchParams;
  if (!ID.test(id)) notFound();
  const user = await getCurrentUser();
  if (!user) return <GuestBootstrap />;

  // Tour expiré pendant l'absence : réglé avant l'affichage
  await sweepBattlesFor(user.id);
  const ctx = await battleCtx();
  // ?rang=GOLD : aperçu de la couleur d'un rang sur le plateau, réservé aux admins (classé en 9b)
  const previewTier = user.role === "ADMIN" ? parseBoardTier(rang) : null;
  const view = await getBattleView(id, user.id, ctx.rules, previewTier, ctx.ranked);
  if (!view) notFound();
  const candidates = view.canJoin ? await getCandidates(user.id, ctx.rules) : [];
  const lastTeam = view.canJoin ? await getLastTeam(user.id, candidates) : [];

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <BattleScreen
        view={view}
        candidates={candidates}
        abilities={{ keywordValues: ctx.rules.keywordValues, techniques: ctx.rules.techniques }}
        lastTeam={lastTeam}
      />
    </div>
  );
}
