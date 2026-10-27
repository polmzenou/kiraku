import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { ClaimAllMissionsButton, ClaimMissionButton } from "@/components/economy/ClaimButton";
import { LotRewards } from "@/components/economy/LotRewards";
import { MissionResetTimer } from "@/components/economy/MissionResetTimer";
import { GuestBootstrap } from "@/components/GuestBootstrap";
import { PageShell } from "@/components/PageShell";
import { SectionTitle } from "@/components/SectionTitle";
import { localize, localizedSchema } from "@/lib/boosters/types";
import { getRaritySeals } from "@/server/catalog/rarities";
import { MISSION_PERIODS, shownProgress, type MissionMetric } from "@/lib/economy/missions";
import { prisma } from "@/server/db";
import { lotViews } from "@/server/economy/lot-view";
import { playerMissionsWith, type PlayerMission } from "@/server/economy/missions-core";
import { getSetting } from "@/server/settings";
import { getCurrentUser } from "@/server/user";

export const metadata: Metadata = { robots: { index: false, follow: false } };

const PERIOD_KANJI = { DAILY: "日", WEEKLY: "週" } as const;

/** Sceau de chaque objectif (« tirer une rareté » prend le sceau de la rareté visée). */
const METRIC_KANJI: Record<MissionMetric, string> = {
  VISIT: "訪",
  OPEN_BOOSTERS: "開",
  PULL_RARITY: "稀",
  DISCOVER_CARDS: "新",
  RECYCLE_ZENI: "札",
  SPEND_ZENI: "銭",
  SEND_GIFTS: "贈",
  ADD_FRIENDS: "友",
};

/** Missions du jour et de la semaine : progression, récompense, bouton Réclamer. */
export default async function MissionsPage() {
  const RARITY_SEAL = await getRaritySeals();
  const [t, tRarity, user, locale] = await Promise.all([
    getTranslations("economy.missions"),
    getTranslations("rarity"),
    getCurrentUser(),
    getLocale(),
  ]);
  if (!user) {
    return (
      <PageShell>
        <GuestBootstrap />
      </PageShell>
    );
  }

  const [enabled, timeZone] = await Promise.all([getSetting("missions.enabled"), getSetting("game.timeZone")]);
  const now = new Date();
  const missions = enabled ? await playerMissionsWith(prisma, user.id, now, timeZone) : [];
  const lots = await lotViews(
    missions.map((m) => m.lotId),
    locale,
  );

  const titleOf = (m: PlayerMission) => {
    const custom = localizedSchema.safeParse(m.title);
    if (custom.success) return localize(custom.data, locale);
    return t(`metric.${m.metric}`, { count: m.goal, rarity: m.rarity ? tRarity(m.rarity) : "" });
  };
  const claimable = missions.filter((m) => m.state === "CLAIMABLE").length;

  return (
    <PageShell>
      <SectionTitle level={1} kanji="任務" title={t("title")} subtitle={t("intro")} />

      {!enabled && <p className="lacquer rounded-card p-6 text-center text-text-muted">{t("disabled")}</p>}
      {enabled && missions.length === 0 && (
        <p className="lacquer rounded-card p-6 text-center text-text-muted">{t("empty")}</p>
      )}

      {missions.length > 0 && (
        <dl className="grid grid-cols-3 gap-2">
          {MISSION_PERIODS.map((period) => {
            const list = missions.filter((m) => m.period === period);
            const done = list.filter((m) => m.state === "CLAIMED").length;
            return (
              <div key={period} className="flex flex-col gap-1 lacquer rounded-card p-3">
                <dt className="text-xs text-text-muted">{t(`period.${period}`)}</dt>
                <dd className="text-lg font-bold tabular-nums">{t("claimedCount", { done, total: list.length })}</dd>
              </div>
            );
          })}
          <div className={`flex flex-col gap-1 rounded-card border p-3 ${claimable > 0 ? "border-kin bg-kin/10" : "border-border bg-surface"}`}>
            <dt className="text-xs text-text-muted">{t("ready")}</dt>
            <dd className={`text-lg font-bold tabular-nums ${claimable > 0 ? "text-kin" : ""}`}>{claimable}</dd>
          </div>
        </dl>
      )}

      {missions.length > 0 && (
        <div className="flex justify-end empty:hidden">
          <ClaimAllMissionsButton count={claimable} />
        </div>
      )}

      {MISSION_PERIODS.map((period) => {
        const list = missions.filter((m) => m.period === period);
        if (list.length === 0) return null;
        return (
          <section key={period} className="flex flex-col gap-3" aria-labelledby={`missions-${period}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id={`missions-${period}`} className="flex items-center gap-3 font-heading text-xl font-bold">
                <span
                  aria-hidden="true"
                  lang="ja"
                  className="flex size-10 items-center justify-center rounded-[4px] bg-shu-btn font-seal text-2xl text-washi-paper"
                >
                  {PERIOD_KANJI[period]}
                </span>
                {t(`period.${period}`)}
              </h2>
              <MissionResetTimer endsAt={list[0].endsAt.getTime()} initialNow={now.getTime()} />
            </div>

            <ul className="grid gap-3 md:grid-cols-2">
              {list.map((m) => {
                const shown = shownProgress(m.progress, m.goal);
                const title = titleOf(m);
                const claimed = m.state === "CLAIMED";
                const ready = m.state === "CLAIMABLE";
                return (
                  <li
                    key={m.id}
                    className={`relative flex gap-3 rounded-card border bg-surface p-4 transition-colors ${
                      ready
                        ? "border-kin shadow-[0_0_0_1px_var(--color-kin),0_0_28px_-10px_var(--color-kin)]"
                        : claimed
                          ? "border-border opacity-75"
                          : "border-border"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      lang="ja"
                      className={`flex size-12 shrink-0 items-center justify-center rounded-control border font-seal text-2xl ${
                        ready ? "border-kin bg-kin/15 text-kin" : "border-border bg-surface-2 text-shu"
                      }`}
                    >
                      {m.metric === "PULL_RARITY" && m.rarity ? RARITY_SEAL[m.rarity] : METRIC_KANJI[m.metric]}
                    </span>

                    <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                      <span className={`self-start rounded-full border px-2 py-0.5 text-xs font-bold ${
                        m.difficulty === "HARD" ? "border-shu/40 bg-shu/10 text-shu"
                          : m.difficulty === "MEDIUM" ? "border-kin/40 bg-kin/10 text-kin"
                            : "border-border bg-surface-2 text-text-muted"
                      }`}>{t(`difficulty.${m.difficulty}`)}</span>
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-bold leading-snug">{title}</p>
                        <p className={`shrink-0 text-sm font-bold tabular-nums ${ready || claimed ? "text-kin" : "text-text-muted"}`}>
                          {t("progress", { value: shown, goal: m.goal })}
                        </p>
                      </div>
                      <div
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={m.goal}
                        aria-valuenow={shown}
                        aria-label={title}
                        className="h-2.5 overflow-hidden rounded-full bg-surface-2 shadow-[inset_0_1px_2px_rgb(0_0_0/0.35)]"
                      >
                        <div
                          className={`h-full w-full origin-left rounded-full transition-transform duration-700 motion-reduce:transition-none ${
                            m.state === "IN_PROGRESS" ? "bg-ai" : "bg-[linear-gradient(90deg,var(--color-kin),#f2d88a)]"
                          }`}
                          style={{ transform: `scaleX(${shown / m.goal})` }}
                        />
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <LotRewards lot={lots.get(m.lotId)} />
                        {(ready || claimed) && <ClaimMissionButton missionId={m.id} claimed={claimed} />}
                      </div>
                    </div>

                    {claimed && (
                      <span
                        aria-hidden="true"
                        lang="ja"
                        className="pointer-events-none absolute -top-2 -right-2 flex size-10 rotate-12 items-center justify-center rounded-[4px] border-2 border-shu font-seal text-xl text-shu"
                      >
                        済
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </PageShell>
  );
}
