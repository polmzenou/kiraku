"use client";

import { useTranslations } from "next-intl";
import { useCallback, useState, useTransition } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import type { Activity, CandidateCard } from "@/lib/battle/view";
import { createRoomAction, joinQueueAction, joinRoomAction, type BattleActionError } from "@/server/actions/battle";
import { Button } from "../ui/Button";
import { buttonClasses } from "../ui/Button";
import type { RankView } from "@/server/ranked/queries";
import { RankBadge } from "../ranked/RankBadge";
import { SeasonReward } from "../ranked/SeasonReward";
import { QueueWaiting } from "./QueueWaiting";
import { useBattleError } from "./useBattleError";
import type { AbilityRules } from "./AbilityGuide";
import { TeamPicker } from "./TeamPicker";
import { inputClass } from "../ui/Field";

type Intent =
  | { kind: "EXHIBITION" }
  | { kind: "RANKED" }
  | { kind: "CREATE_ROOM" }
  | { kind: "JOIN_CODE"; code: string }
  | { kind: "CHALLENGE"; inviteeId: string; name: string };

/** Accueil du combat : exhibition, classé (9b), salle d'amis ; partie en cours à reprendre. */
export function CombatHub({
  activity,
  candidates,
  abilities,
  lastTeam,
  queueSeconds,
  challenge,
  rank,
}: {
  activity: Activity;
  candidates: CandidateCard[];
  abilities: AbilityRules;
  lastTeam: string[];
  queueSeconds: number;
  /** Ami à défier (lien « Défier » de son profil) : le choix d'équipe s'ouvre directement. */
  challenge: { id: string; name: string } | null;
  /** Rang du joueur ; null si le classé est fermé. */
  rank: RankView | null;
}) {
  const t = useTranslations("battle");
  const tRanked = useTranslations("ranked");
  const router = useRouter();
  const [intent, setIntent] = useState<Intent | null>(() =>
    challenge && activity.kind === "NONE" ? { kind: "CHALLENGE", inviteeId: challenge.id, name: challenge.name } : null,
  );
  const [queue, setQueue] = useState(activity.kind === "QUEUE" ? { joinedAt: activity.joinedAt, botAt: activity.botAt } : null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const errorText = useBattleError();

  const fail = (e: BattleActionError, battleId?: string) => {
    if (e === "IN_BATTLE" && battleId) return router.push(`/combat/${battleId}`);
    setError(errorText(e));
  };

  const confirm = (cardIds: string[]) =>
    startTransition(async () => {
      if (!intent) return;
      setError(null);
      if (intent.kind === "EXHIBITION" || intent.kind === "RANKED") {
        const res = await joinQueueAction({ cardIds, mode: intent.kind });
        if (!res.ok) return fail(res.error, res.battleId);
        setIntent(null);
        if (res.state === "MATCHED") return router.push(`/combat/${res.battleId}`);
        if (res.state === "WAITING") setQueue({ joinedAt: res.joinedAt, botAt: res.botAt });
        return;
      }
      const res =
        intent.kind === "CREATE_ROOM"
          ? await createRoomAction({ cardIds, inviteeId: null })
          : intent.kind === "CHALLENGE"
            ? await createRoomAction({ cardIds, inviteeId: intent.inviteeId })
            : await joinRoomAction({ cardIds, code: intent.code });
      if (!res.ok) return fail(res.error, res.battleId);
      setIntent(null);
      router.push(`/combat/${res.battleId}`);
    });

  const onLeft = useCallback(
    (e?: BattleActionError) => {
      setQueue(null);
      if (e) setError(errorText(e));
      router.refresh();
    },
    [errorText, router],
  );

  if (queue) return <QueueWaiting joinedAt={queue.joinedAt} botAt={queue.botAt} onLeft={onLeft} />;

  const busy = activity.kind === "ROOM" || activity.kind === "BATTLE";

  return (
    <div className="flex flex-col gap-4">
      {busy && (
        <aside className="flex flex-col items-start gap-3 rounded-card border border-kin/60 bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-medium">{t(`activity.${activity.kind}`)}</p>
          <Link href={`/combat/${activity.battleId}`} className={buttonClasses("primary")}>
            {t("activity.resume")}
          </Link>
        </aside>
      )}

      {error && (
        <p role="alert" className="rounded-control border border-shu/60 bg-surface p-3 text-sm text-shu">
          {error}
        </p>
      )}

      {rank?.reward && <SeasonReward {...rank.reward} />}

      {/* Classé : le panneau prend la couleur du rang du joueur */}
      <section className="battle-board battle-rim rounded-[18px] p-[3px]" data-tier={rank?.tier}>
        <div className="battle-table flex flex-col gap-4 rounded-[15px] p-4 text-washi-paper md:flex-row md:items-center md:gap-8 md:p-6">
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <h2 className="flex items-center gap-2 font-heading text-xl font-extrabold">
              {t("ranked.title")}
              {rank?.season && <span className="text-sm font-medium text-[#a89f92]">· {tRanked("season", { number: rank.season.number })}</span>}
            </h2>
            {rank ? (
              <RankBadge tier={rank.tier} division={rank.division} pc={rank.pc} progress={rank.progress} next={rank.next} nextRank={rank.nextRank} size={84} />
            ) : (
              <p className="text-sm text-[#a89f92]">{tRanked("disabled")}</p>
            )}
          </div>
          {rank && (
            <div className="flex flex-col gap-2 text-sm md:w-72">
              {rank.protection > 0 && (
                <p className="rounded-control border border-[var(--board-accent)]/60 px-3 py-2" title={tRanked("protectionHint")}>
                  {tRanked("protection", { count: rank.protection })}
                </p>
              )}
              <p className="text-[#a89f92]">{tRanked("games", { count: rank.seasonGames })}</p>
              {rank.season && <p className="text-[#a89f92]">{tRanked("seasonEnds", { date: new Date(rank.season.endsAt) })}</p>}
              <Button variant="primary" disabled={busy || pending} onClick={() => setIntent({ kind: "RANKED" })}>
                {tRanked("play")}
              </Button>
            </div>
          )}
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <article className="flex flex-col gap-3 lacquer rounded-card p-4">
          <h2 className="flex items-center gap-2 font-heading text-lg font-bold">
            {t("exhibition.title")}
          </h2>
          <p className="flex-1 text-sm text-text-muted">{t("exhibition.text", { seconds: queueSeconds })}</p>
          <Button variant="primary" disabled={busy || pending} onClick={() => setIntent({ kind: "EXHIBITION" })}>
            {t("exhibition.cta")}
          </Button>
        </article>

        <article className="flex flex-col gap-3 lacquer rounded-card p-4">
          <h2 className="flex items-center gap-2 font-heading text-lg font-bold">
            {t("friend.title")}
          </h2>
          <p className="text-sm text-text-muted">{t("friend.text")}</p>
          <Button disabled={busy || pending} onClick={() => setIntent({ kind: "CREATE_ROOM" })}>
            {t("friend.create")}
          </Button>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (code.trim().length >= 6) setIntent({ kind: "JOIN_CODE", code: code.trim().toUpperCase() });
            }}
          >
            <label className="min-w-0 flex-1">
              <span className="sr-only">{t("friend.codeLabel")}</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
                placeholder={t("friend.codePlaceholder")}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                inputMode="text"
                className={`${inputClass} font-bold tracking-[0.3em] tabular-nums uppercase`}
              />
            </label>
            <Button type="submit" disabled={busy || pending || code.length !== 6}>
              {t("friend.join")}
            </Button>
          </form>
        </article>
      </div>

      {intent && (
        <TeamPicker
          open
          onClose={() => setIntent(null)}
          candidates={candidates}
          abilities={abilities}
          initial={lastTeam}
          pending={pending}
          confirmLabel={
            intent.kind === "EXHIBITION"
              ? t("exhibition.cta")
              : intent.kind === "RANKED"
                ? tRanked("play")
              : intent.kind === "CREATE_ROOM"
                ? t("friend.create")
                : intent.kind === "CHALLENGE"
                  ? t("friend.challengeTitle", { name: intent.name })
                  : t("friend.join")
          }
          onConfirm={confirm}
        />
      )}
    </div>
  );
}
