"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { getPathname, Link, useRouter } from "@/i18n/navigation";
import { withShareCode } from "@/lib/referral/share";
import { useShareCode } from "../referral/ShareCode";
import type { BattleView, DeckView } from "@/lib/battle/view";
import { battleViewAction, cancelRoomAction, joinRoomAction } from "@/server/actions/battle";
import { useHoldAwake } from "../realtime/activity";
import { useRealtime } from "../realtime/RealtimeProvider";
import { usePoll } from "../realtime/usePoll";
import { Button, buttonClasses } from "../ui/Button";
import { usePlayerName } from "./usePlayerName";
import type { AbilityRules } from "./AbilityGuide";
import { TeamPicker } from "./TeamPicker";
import { useBattleError } from "./useBattleError";
import { useCandidatePool } from "./useCandidatePool";
import { useTickingNow } from "./useTickingNow";

/**
 * Durée de vie restante du code, en m:ss. Son propre compte à rebours : seul ce texte se re-rend chaque seconde,
 * pas le choix d'équipe ouvert à côté ; au rendu serveur et à l'hydratation, l'heure du rendu serveur.
 */
function RoomExpiry({ until, serverNow, className }: { until: string; serverNow: number; className: string }) {
  const t = useTranslations("battle.room");
  const now = useTickingNow(serverNow);
  const s = Math.max(0, Math.floor((new Date(until).getTime() - now) / 1_000));
  return <p className={className}>{t("expires", { time: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` })}</p>;
}

// Partage natif : lu après l'hydratation (le serveur n'a pas navigator.share, le téléphone si)
const noSubscribe = () => () => {};
const canShare = () => typeof navigator !== "undefined" && "share" in navigator;

// Action qui lève (serveur injoignable, panne) : erreur traduite au lieu d'un écran d'erreur
const UNAVAILABLE = { ok: false, error: "UNAVAILABLE", battleId: undefined } as const;

/** Salle d'amis ouverte : le créateur partage son code et attend ; l'invité choisit son équipe et entre. */
export function RoomLobby({ view, abilities, decks }: { view: BattleView; abilities: AbilityRules; decks: DeckView[] }) {
  const t = useTranslations("battle");
  const locale = useLocale();
  const shareCode = useShareCode();
  const router = useRouter();
  const name = usePlayerName();
  const [copied, setCopied] = useState(false);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const share = useSyncExternalStore(noSubscribe, canShare, () => false);
  // Cartes du choix d'équipe de l'invité, chargées à sa première ouverture
  const pool = useCandidatePool(picking);
  const serverNow = Date.parse(view.serverNow);

  // Le créateur attend : dès que la partie démarre (signal « matched » en direct, ou sondage de
  // secours) ou que la salle ferme, la page se recharge
  const waiting = !view.canJoin;
  const { subscribe } = useRealtime();
  useHoldAwake(waiting);
  const checkRoom = useCallback(async () => {
    const res = await battleViewAction({ battleId: view.id });
    if (res.ok && res.view.status !== "WAITING") router.refresh();
  }, [router, view.id]);
  usePoll(checkRoom, { seconds: view.lobbyPollSeconds, enabled: waiting });
  useEffect(() => {
    if (!waiting) return;
    return subscribe("user", "matched", (data) => {
      if ((data as { battleId?: unknown }).battleId === view.id) router.refresh();
    });
  }, [router, subscribe, view.id, waiting]);

  const errorText = useBattleError();

  if (view.canJoin) {
    return (
      <section className="flex flex-col items-center gap-4 lacquer rounded-card px-4 py-8 text-center">
        <span aria-hidden="true" className="font-title text-3xl font-bold text-shu">
          {t("title")}
        </span>
        <h2 className="font-heading text-xl font-bold">{t("room.invited", { name: name(view.players[0]) })}</h2>
        {view.codeExpiresAt && <RoomExpiry until={view.codeExpiresAt} serverNow={serverNow} className="text-sm text-text-muted" />}
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
          pool={pool}
          decks={decks}
          abilities={abilities}
          pending={pending}
          confirmLabel={t("friend.join")}
          onConfirm={(cardIds) =>
            startTransition(async () => {
              const res = await joinRoomAction({ cardIds, battleId: view.id }).catch(() => UNAVAILABLE);
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
            {share && (
              <Button onClick={() => void navigator.share({ text: t("room.shareText", { code }), url: withShareCode(new URL(getPathname({ href: "/combat", locale }), window.location.origin).href, shareCode) }).catch(() => undefined)}>{t("room.share")}</Button>
            )}
          </div>
        </>
      )}
      <p className="flex items-center gap-2 text-sm" aria-live="polite">
        <span aria-hidden="true" className="inline-block size-3 animate-pulse rounded-full bg-shu motion-reduce:animate-none" />
        {t("room.waiting")}
      </p>
      {view.codeExpiresAt && <RoomExpiry until={view.codeExpiresAt} serverNow={serverNow} className="text-xs text-text-muted" />}
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
              const res = await cancelRoomAction({ battleId: view.id }).catch(() => UNAVAILABLE);
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
