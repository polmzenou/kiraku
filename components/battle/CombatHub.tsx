"use client";

import { useTranslations } from "next-intl";
import { useCallback, useState, useTransition } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import type { Activity, CandidateCard } from "@/lib/battle/view";
import { createRoomAction, joinQueueAction, joinRoomAction, type BattleActionError } from "@/server/actions/battle";
import { Button } from "../ui/Button";
import { buttonClasses } from "../ui/Button";
import { QueueWaiting } from "./QueueWaiting";
import { useBattleError } from "./useBattleError";
import { TeamPicker } from "./TeamPicker";

type Intent = { kind: "EXHIBITION" } | { kind: "CREATE_ROOM" } | { kind: "JOIN_CODE"; code: string };

/** Accueil du combat : exhibition, classé (9b), salle d'amis ; partie en cours à reprendre. */
export function CombatHub({
  activity,
  candidates,
  lastTeam,
  queueSeconds,
}: {
  activity: Activity;
  candidates: CandidateCard[];
  lastTeam: string[];
  queueSeconds: number;
}) {
  const t = useTranslations("battle");
  const router = useRouter();
  const [intent, setIntent] = useState<Intent | null>(null);
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
      if (intent.kind === "EXHIBITION") {
        const res = await joinQueueAction({ cardIds, mode: "EXHIBITION" });
        if (!res.ok) return fail(res.error, res.battleId);
        setIntent(null);
        if (res.state === "MATCHED") return router.push(`/combat/${res.battleId}`);
        if (res.state === "WAITING") setQueue({ joinedAt: res.joinedAt, botAt: res.botAt });
        return;
      }
      const res =
        intent.kind === "CREATE_ROOM" ? await createRoomAction({ cardIds, inviteeId: null }) : await joinRoomAction({ cardIds, code: intent.code });
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
        <aside className="flex flex-col items-start gap-3 rounded-lg border border-kin/60 bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-medium">{t(`activity.${activity.kind}`)}</p>
          <Link href={`/combat/${activity.battleId}`} className={buttonClasses("shu")}>
            {t("activity.resume")}
          </Link>
        </aside>
      )}

      {error && (
        <p role="alert" className="rounded-button border border-shu/60 bg-surface p-3 text-sm text-shu">
          {error}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <article className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
          <h2 className="flex items-center gap-2 font-title text-lg font-bold">
            <span aria-hidden="true" lang="ja" className="font-seal text-shu">
              戦
            </span>
            {t("exhibition.title")}
          </h2>
          <p className="flex-1 text-sm text-text-muted">{t("exhibition.text", { seconds: queueSeconds })}</p>
          <Button variant="shu" disabled={busy || pending} onClick={() => setIntent({ kind: "EXHIBITION" })}>
            {t("exhibition.cta")}
          </Button>
        </article>

        <article className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 opacity-70">
          <h2 className="flex items-center gap-2 font-title text-lg font-bold">
            <span aria-hidden="true" lang="ja" className="font-seal text-kin">
              勝
            </span>
            {t("ranked.title")}
          </h2>
          <p className="flex-1 text-sm text-text-muted">{t("ranked.text")}</p>
          <Button disabled>{t("ranked.soon")}</Button>
        </article>

        <article className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
          <h2 className="flex items-center gap-2 font-title text-lg font-bold">
            <span aria-hidden="true" lang="ja" className="font-seal text-ai">
              友
            </span>
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
                className="min-h-11 w-full rounded-button border border-border bg-bg px-3 font-bold tracking-[0.3em] tabular-nums uppercase"
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
          initial={lastTeam}
          pending={pending}
          confirmLabel={intent.kind === "EXHIBITION" ? t("exhibition.cta") : intent.kind === "CREATE_ROOM" ? t("friend.create") : t("friend.join")}
          onConfirm={confirm}
        />
      )}
    </div>
  );
}
