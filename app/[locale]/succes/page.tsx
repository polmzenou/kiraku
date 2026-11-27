import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { AchievementGrid, type AchievementSection, type AchievementTileView } from "@/components/achievements/AchievementGrid";
import { GuestBootstrap } from "@/components/GuestBootstrap";
import { PageShell } from "@/components/PageShell";
import { SectionTitle } from "@/components/SectionTitle";
import { ACHIEVEMENT_CATEGORIES, CATEGORY_KANJI, type AchievementDef } from "@/lib/achievements/catalog";
import type { AchievementProgress } from "@/lib/achievements/evaluate";
import { syncAchievements } from "@/server/achievements/sync";
import { prisma } from "@/server/db";
import { getCurrentUser } from "@/server/user";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Succès du joueur : une grille par catégorie, l'avancée de chacun, et le succès mis en avant sous l'avatar. */
export default async function AchievementsPage() {
  const [t, format, user] = await Promise.all([getTranslations("achievements"), getFormatter(), getCurrentUser()]);
  if (!user) {
    return (
      <PageShell>
        <GuestBootstrap />
      </PageShell>
    );
  }

  // Le succès mis en avant ne dépend pas du calcul : les deux lectures partent ensemble
  const [board, { featuredAchievement }] = await Promise.all([
    syncAchievements(user.id),
    prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { featuredAchievement: true } }),
  ]);
  if (!board) {
    return (
      <PageShell>
        <SectionTitle level={1} kanji="実績" title={t("title")} />
        <p className="lacquer rounded-card p-6 text-center text-text-muted">{t("disabled")}</p>
      </PageShell>
    );
  }

  const tile = (a: AchievementDef, p: AchievementProgress): AchievementTileView => {
    const hidden = Boolean(a.secret) && !p.unlocked;
    const progressLabel =
      p.kind === "count"
        ? a.metric === "CATALOG_PERCENT"
          ? t("progress.percent", { value: p.current, goal: p.goal })
          : t("progress.count", { value: p.current, goal: p.goal })
        : p.kind === "position"
          ? p.best
            ? t("progress.bestPlace", { place: p.best })
            : t("progress.noPlace")
          : p.unlocked
            ? t("progress.done")
            : t("progress.todo");
    return {
      key: a.key,
      rank: a.rank,
      name: hidden ? t("secret.name") : t(`items.${a.key}.name` as "items.booster-1.name"),
      desc: hidden ? t("secret.desc") : t(`items.${a.key}.desc` as "items.booster-1.desc", { count: p.target }),
      unlocked: p.unlocked,
      unlockedLabel: p.unlockedAt ? t("unlockedOn", { date: format.dateTime(p.unlockedAt, { day: "numeric", month: "short", year: "numeric" }) }) : null,
      progressLabel: hidden ? t("progress.hidden") : progressLabel,
      ratio: hidden ? 0 : p.ratio,
      hidden,
    };
  };

  const byKey = new Map(board.progress.map((p) => [p.key, p]));
  const sections: AchievementSection[] = ACHIEVEMENT_CATEGORIES.map((category) => ({
    category,
    kanji: CATEGORY_KANJI[category],
    title: t(`categories.${category}`),
    tiles: board.defs.filter((a) => a.category === category).flatMap((a) => {
      const p = byKey.get(a.key);
      return p ? [tile(a, p)] : [];
    }),
  })).filter((s) => s.tiles.length > 0);
  const unlocked = board.progress.filter((p) => p.unlocked).length;
  const featured = featuredAchievement && board.progress.some((p) => p.key === featuredAchievement && p.unlocked) ? featuredAchievement : null;

  return (
    <PageShell>
      <SectionTitle level={1} kanji="実績" title={t("title")} subtitle={t("intro")} />
      <div className="lacquer flex items-center gap-4 rounded-card p-4">
        <span className="font-heading text-3xl font-extrabold text-kin tabular-nums">{format.number(unlocked)}</span>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className="text-sm font-bold">{t("summary", { unlocked, total: board.progress.length })}</p>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={board.progress.length}
            aria-valuenow={unlocked}
            aria-label={t("summaryLabel")}
            className="h-2 overflow-hidden rounded-full bg-surface-2 shadow-[inset_0_1px_2px_rgb(0_0_0/0.35)]"
          >
            <div
              className="h-full w-full origin-left rounded-full bg-[linear-gradient(90deg,var(--color-kin),#f2d88a)]"
              style={{ transform: `scaleX(${board.progress.length > 0 ? unlocked / board.progress.length : 0})` }}
            />
          </div>
        </div>
      </div>
      <AchievementGrid sections={sections} featured={featured} canFeature={!user.isGuest && !user.bannedAt} />
    </PageShell>
  );
}
