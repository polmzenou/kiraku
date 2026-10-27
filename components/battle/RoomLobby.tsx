"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import type { BattleView, CandidateCard } from "@/lib/battle/view";
import { battleViewAction, cancelRoomAction, joinRoomAction } from "@/server/actions/battle";
import { Button, buttonClasses } from "../ui/Button";
import { usePlayerName } from "./BoardLayout";
import type { AbilityRules } from "./AbilityGuide";
import { TeamPicker } from "./TeamPicker";
import { useBattleError } from "./useBattleError";

const POLL_MS = 3_000;

function useCountdown(until: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);
  if (!until) return null;
  const s = Math.max(0, Math.floor((new Date(until).getTime() - now) / 1_000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Salle d'amis ouverte : le créateur partage son code et attend ; l'invité choisit son équipe et entre. */
export function RoomLobby({
  view,
  candidates,
  abilities,
  lastTeam,
}: {
  view: BattleView;
  candidates: CandidateCard[];
  abilities: AbilityRules;
  lastTeam: string[];
}) {
  const t = useTranslations("battle");
  const router = useRouter();
  const name = usePlayerName();
  const [copied, setCopied] = useState(false);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const time = useCountdown(view.codeExpiresAt);

  // Le créateur attend : dès que la partie démarre (ou que la salle ferme), la page se recharge
  useEffect(() => {
    if (view.canJoin) return;
    const id = setInterval(async () => {
      const res = await battleViewAction({ battleId: view.id });
      if (res.ok && res.view.status !== "WAITING") router.refresh();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [router, view.canJoin, view.id]);

  const errorText = useBattleError();

  if (view.canJoin) {
    return (
      <section className="flex flex-col items-center gap-4 lacquer rounded-card px-4 py-8 text-center">
        <span aria-hidden="true" className="font-title text-3xl font-bold text-shu">
          {t("title")}
        </span>
        <h2 className="font-heading text-xl font-bold">{t("room.invited", { name: name(view.players[0]) })}</h2>
        {time && <p className="text-sm text-text-muted">{t("room.expires", { time })}</p>}
        {error && (
          <p role="alert" className="text-sm text-shu">
            {error}
          </p>
        )}
        <Button variant="primary" onClick={() => setPicking(true)} disabled={pending}>
          {t("room.accept")}
        </Button>
        <TeamPicker
          open={picking}
          onClose={() => setPicking(false)}
          candidates={candidates}
          abilities={abilities}
          initial={lastTeam}
          pending={pending}
          confirmLabel={t("friend.join")}
          onConfirm={(cardIds) =>
            startTransition(async () => {
              const res = await joinRoomAction({ cardIds, battleId: view.id });
              if (res.ok) return router.refresh();
              if (res.error === "IN_BATTLE" && res.battleId) return router.push(`/combat/${res.battleId}`);
              setPicking(false);
              setError(errorText(res.error));
            })
          }
        />
      </section>
    );
  }

  const code = view.code ?? "";
  return (
    <section className="flex flex-col items-center gap-4 lacquer rounded-card px-4 py-8 text-center">
      <h2 className="font-heading text-xl font-bold">{t("room.title")}</h2>
      {view.players[1] ? (
        <p className="text-sm text-text-muted">{t("room.reserved")}</p>
      ) : (
        <>
          <p className="text-xs text-text-muted">{t("room.code")}</p>
          <p
            className="rounded-card border-2 border-dashed border-kin px-5 py-3 font-title text-4xl font-extrabold tracking-[0.25em] tabular-nums text-kin"
            aria-live="polite"
          >
            {code}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(code);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2_000);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? t("room.copied") : t("room.copy")}
            </Button>
            {typeof navigator !== "undefined" && "share" in navigator && (
              <Button onClick={() => void navigator.share({ text: t("room.shareText", { code }) }).catch(() => undefined)}>{t("room.share")}</Button>
            )}
          </div>
        </>
      )}
      <p className="flex items-center gap-2 text-sm" aria-live="polite">
        <span aria-hidden="true" className="inline-block size-3 animate-pulse rounded-full bg-shu motion-reduce:animate-none" />
        {t("room.waiting")}
      </p>
      {time && <p className="text-xs text-text-muted">{t("room.expires", { time })}</p>}
      {error && (
        <p role="alert" className="text-sm text-shu">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-center gap-2">
        <Button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await cancelRoomAction({ battleId: view.id });
              if (res.ok || res.error === "CLOSED") return router.push("/combat");
              setError(errorText(res.error));
            })
          }
        >
          {t("room.cancel")}
        </Button>
        <Link href="/combat" className={buttonClasses("secondary")}>
          {t("room.back")}
        </Link>
      </div>
    </section>
  );
}
