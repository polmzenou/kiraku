import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getFormatter, getTranslations } from "next-intl/server";
import { AbilityGuide } from "@/components/battle/AbilityGuide";
import { CombatHub } from "@/components/battle/CombatHub";
import { GuestBootstrap } from "@/components/GuestBootstrap";
import { PageShell } from "@/components/PageShell";
import { SectionTitle } from "@/components/SectionTitle";
import { playerTag } from "@/components/social/PlayerName";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import type { PlayerView } from "@/lib/battle/view";
import { battleCtx, challengeTarget, getActivity, getCandidates, getHistory, getLastTeam, sweepBattlesFor } from "@/server/battle/queries";
import { getRankView } from "@/server/ranked/queries";
import { getCurrentUser } from "@/server/user";

export async function generateMetadata({ params }: PageProps<"/[locale]/combat">): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = hasLocale(routing.locales, raw) ? raw : routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: "battle" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

/** Combat : exhibition, salle d'amis (code), classé à l'étape 9b, dernières parties et règles. */
export default async function CombatPage({ searchParams }: PageProps<"/[locale]/combat">) {
  const [t, tRanked, format, user] = await Promise.all([getTranslations("battle"), getTranslations("ranked"), getFormatter(), getCurrentUser()]);
  if (!user) {
    return (
      <PageShell>
        <GuestBootstrap />
      </PageShell>
    );
  }

  const ctx = await battleCtx();
  const header = <SectionTitle level={1} title={t("title")} subtitle={t("intro")} />;

  if (user.isGuest || !ctx.rules.enabled) {
    return (
      <PageShell>
        {header}
        <aside className="flex flex-col items-start gap-3 lacquer rounded-card p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">{user.isGuest ? t("guest") : t("disabled")}</p>
          {user.isGuest && (
            <ButtonLink href="/inscription" variant="primary">
              {t("signUp")}
            </ButtonLink>
          )}
        </aside>
        {user.isGuest && ctx.rules.enabled && <AbilityGuide rules={ctx.rules} />}
      </PageShell>
    );
  }

  await sweepBattlesFor(user.id);
  const [activity, candidates, history, rank] = await Promise.all([
    getActivity(user.id, ctx.rules.queueSeconds),
    getCandidates(user.id, ctx.rules),
    getHistory(user.id),
    ctx.ranked.enabled ? getRankView(user.id, ctx.ranked) : null,
  ]);
  const lastTeam = await getLastTeam(user.id, candidates);
  // ?defier=pseudo (bouton du profil) : seulement un ami accepté, la salle le revérifie à la création
  const { defier } = await searchParams;
  const challenge = typeof defier === "string" ? await challengeTarget(user.id, defier) : null;
  const name = (p: PlayerView | null) => (!p ? "—" : "bot" in p ? t("board.bot", { name: t(`bots.${p.bot}` as "bots.TENGU") }) : p.username);

  return (
    <PageShell>
      {header}
      <CombatHub
        activity={activity}
        candidates={candidates}
        abilities={{ keywordValues: ctx.rules.keywordValues, techniques: ctx.rules.techniques }}
        lastTeam={lastTeam}
        queueSeconds={ctx.rules.queueSeconds}
        challenge={challenge}
        rank={rank}
      />

      <section className="flex flex-col gap-3">
        <SectionTitle title={t("rules.title")} />
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-text-muted">
          <li>{t("rules.items.turn")}</li>
          <li>{t("rules.items.orbs", { max: ctx.rules.orbs.max })}</li>
          <li>{t("rules.items.damage")}</li>
          <li>{t("rules.items.timer", { seconds: ctx.rules.turnSeconds })}</li>
          <li>{t("rules.items.end")}</li>
        </ul>
      </section>

      <AbilityGuide rules={ctx.rules} />

      <section className="flex flex-col gap-3">
        <SectionTitle title={t("history.title")} />
        {/* Liste défilante : quelques parties visibles, le reste au défilement */}
        {history.length === 0 ? (
          <p className="text-sm text-text-muted">{t("history.empty")}</p>
        ) : (
          <ul
            tabIndex={0}
            aria-label={t("history.title")}
            className="flex max-h-[26rem] flex-col gap-2 overflow-y-auto overscroll-contain rounded-card pr-1 [scrollbar-gutter:stable]"
          >
            {history.map((h) => (
              <li key={h.id}>
                <Link
                  href={`/combat/${h.id}`}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-control border border-border bg-surface px-3 py-2 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 truncate">
                      <strong className={h.result === "WIN" ? "text-kin" : h.result === "LOSS" ? "text-shu" : "text-text-muted"}>{t(`history.${h.result}`)}</strong> {t.rich("history.vs", {
                        name: name(h.opponent),
                        player: playerTag(h.opponent && "decor" in h.opponent ? h.opponent.decor.nameColor : null),
                      })}
                      <span className="text-text-muted"> · {t(`modes.${h.mode}`)}</span>
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end text-xs">
                    {h.rewardZeni > 0 && <span className="font-bold tabular-nums text-kin">{t("history.zeni", { amount: h.rewardZeni })}</span>}
                    {h.pcDelta !== null && (
                      <span className={`font-bold tabular-nums ${h.pcDelta >= 0 ? "text-[#8fc06a]" : "text-shu"}`}>
                        {tRanked("result.delta", { value: `${h.pcDelta >= 0 ? "+" : "−"}${Math.abs(h.pcDelta)}` })}
                      </span>
                    )}
                    <span className="text-text-muted">{format.dateTime(new Date(h.endedAt), { dateStyle: "short", timeStyle: "short" })}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageShell>
  );
}
