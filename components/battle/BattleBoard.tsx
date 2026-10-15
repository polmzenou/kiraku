"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { legalActions, other } from "@/lib/battle/engine";
import { TECHNIQUE_TARGET, type Action, type BattleSetup, type BattleState } from "@/lib/battle/types";
import type { BattleUpdateView, BattleView } from "@/lib/battle/view";
import { battleSinceAction, claimTimeoutAction, playAction } from "@/server/actions/battle";
import type { ClientAction } from "@/server/battle/battle-core";
import { Button } from "../ui/Button";
import { Sheet } from "../ui/Sheet";
import { BattleResult } from "./BattleResult";
import { BoardLayout, Orbs, usePlayerName } from "./BoardLayout";
import { TurnTimer, useSecondsLeft } from "./TurnTimer";
import { useBattleError } from "./useBattleError";
import { useEventPlayer } from "./useEventPlayer";

type Mode = "ATTACK" | "TECHNIQUE";

/** Sécurité quand Ably est branché : un sondage lent rattrape un message perdu. */
const SAFETY_POLL_MS = 15_000;

function toClient(a: Action): ClientAction {
  if (a.type === "ATTACK") return { type: "ATTACK", actor: a.actor, target: a.target };
  if (a.type === "TECHNIQUE") return a.target === undefined ? { type: "TECHNIQUE", actor: a.actor } : { type: "TECHNIQUE", actor: a.actor, target: a.target };
  return { type: a.type === "FORFEIT" ? "FORFEIT" : "END_TURN" };
}

/**
 * Partie en direct. Le client n'envoie que des intentions (version vue + action) ; chaque réponse ou
 * message temps réel apporte les événements à animer et l'état qui fait foi. Une mise à jour qui
 * ne part pas de notre version déclenche une resynchronisation depuis le journal.
 */
export function BattleBoard({ view }: { view: BattleView & { setup: BattleSetup; state: BattleState } }) {
  const t = useTranslations("battle");
  const router = useRouter();
  const name = usePlayerName();
  const { setup, mySide } = view;
  const opp = other(mySide);
  const player = useEventPlayer(view.state);
  const { shown, animating, play } = player;

  const version = useRef(view.version);
  const [turnEndsAt, setTurnEndsAt] = useState(view.turnEndsAt);
  const [final, setFinal] = useState<{ finished: boolean; rewardZeni: number }>({ finished: false, rewardZeni: 0 });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>("ATTACK");
  const [confirmForfeit, setConfirmForfeit] = useState(false);
  const claimed = useRef<string | null>(null);
  const errorText = useBattleError();
  const syncing = useRef(false);

  const apply = useCallback(
    (u: BattleUpdateView) => {
      version.current = u.version;
      setTurnEndsAt(u.turnEndsAt);
      if (u.finished) setFinal({ finished: true, rewardZeni: u.rewardZeni });
      setSelected(null);
      play(u.events, u.state);
    },
    [play],
  );

  /** Rattrape tout ce qui s'est passé depuis notre version (rejoué côté serveur depuis le journal). */
  const resync = useCallback(async () => {
    if (syncing.current) return;
    syncing.current = true;
    try {
      const res = await battleSinceAction({ battleId: view.id, version: version.current });
      if (res.ok && res.update && res.update.version > version.current) apply(res.update);
    } finally {
      syncing.current = false;
    }
  }, [apply, view.id]);

  const receive = useCallback(
    (u: BattleUpdateView) => {
      if (u.version <= version.current) return; // déjà vu (notre propre action, ou doublon)
      if (u.from !== version.current) return void resync();
      apply(u);
    },
    [apply, resync],
  );

  // Temps réel (Ably) si configuré, sinon sondage ; dans les deux cas, rattrapage au retour sur l'onglet
  useEffect(() => {
    if (final.finished) return;
    let closed = false;
    let client: { close: () => void } | null = null;
    const pollMs = view.realtime ? SAFETY_POLL_MS : view.pollSeconds * 1_000;
    const poll = setInterval(() => void resync(), pollMs);
    if (view.realtime) {
      void import("ably").then(({ Realtime }) => {
        if (closed) return;
        const ably = new Realtime({ authUrl: `/api/realtime/token?battle=${encodeURIComponent(view.id)}`, closeOnUnload: true });
        client = ably;
        void ably.channels.get(`kiraku:battle:${view.id}`).subscribe("update", (msg) => receive(msg.data as BattleUpdateView));
      });
    }
    const onVisible = () => document.visibilityState === "visible" && void resync();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      closed = true;
      clearInterval(poll);
      client?.close();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [final.finished, receive, resync, view.id, view.pollSeconds, view.realtime]);

  const myTurn = !shown.finished && shown.active === mySide;
  const canAct = myTurn && !animating && !pending;
  const legal = useMemo(() => (canAct ? legalActions(setup, shown, mySide) : []), [canAct, setup, shown, mySide]);

  // Minuteur : à zéro, n'importe quel joueur réclame la fin du tour (le serveur vérifie l'échéance)
  const secondsLeft = useSecondsLeft(shown.finished ? null : turnEndsAt, 0);
  useEffect(() => {
    if (secondsLeft === null || secondsLeft > 0 || !turnEndsAt || claimed.current === turnEndsAt || animating) return;
    claimed.current = turnEndsAt;
    const id = setTimeout(async () => {
      const res = await claimTimeoutAction({ battleId: view.id });
      if (res.ok && res.update) receive(res.update);
      else void resync();
    }, 1_000);
    return () => clearTimeout(id);
  }, [animating, receive, resync, secondsLeft, turnEndsAt, view.id]);

  const send = async (action: ClientAction) => {
    setPending(true);
    setError(null);
    try {
      const res = await playAction({ battleId: view.id, version: version.current, action });
      if (res.ok) receive(res.update);
      else {
        if (res.error !== "STALE") setError(errorText(res.error));
        await resync();
      }
    } catch {
      setError(t("errors.UNAVAILABLE"));
    } finally {
      setPending(false);
    }
  };

  // Ce que la sélection permet
  const actorActions = selected === null ? [] : legal.filter((a) => (a.type === "ATTACK" || a.type === "TECHNIQUE") && a.actor === selected);
  const technique = selected === null ? null : setup.teams[mySide][selected].technique;
  const techniqueKind = technique ? TECHNIQUE_TARGET[technique] : null;
  const techniqueActions = actorActions.filter((a) => a.type === "TECHNIQUE");
  const ready = new Set(legal.flatMap((a) => (a.type === "ATTACK" || a.type === "TECHNIQUE" ? [a.actor] : [])));
  const enemyTargets = new Set(
    actorActions.flatMap((a) =>
      mode === "ATTACK" && a.type === "ATTACK" ? [a.target] : mode === "TECHNIQUE" && a.type === "TECHNIQUE" && techniqueKind === "ENEMY" ? [a.target!] : [],
    ),
  );
  const allyTargets = new Set(
    mode === "TECHNIQUE" && techniqueKind === "ALLY" ? techniqueActions.flatMap((a) => (a.type === "TECHNIQUE" ? [a.target!] : [])) : [],
  );

  const pressMine = (i: number) => {
    if (!canAct) return;
    if (allyTargets.has(i) && selected !== null) return void send({ type: "TECHNIQUE", actor: selected, target: i });
    if (!ready.has(i)) return;
    setSelected(selected === i ? null : i);
    setMode("ATTACK");
  };
  const pressTheirs = (i: number) => {
    if (!canAct || selected === null || !enemyTargets.has(i)) return;
    const action = actorActions.find((a) => a.type === mode && "target" in a && a.target === i);
    if (action) void send(toClient(action));
  };
  const pressTechnique = () => {
    if (selected === null || techniqueActions.length === 0) return;
    if (techniqueKind === "NONE") return void send({ type: "TECHNIQUE", actor: selected });
    setMode(mode === "TECHNIQUE" ? "ATTACK" : "TECHNIQUE");
  };

  const hint = !myTurn
    ? t("board.waitOpponent")
    : ready.size === 0
      ? t("board.noActions")
      : selected === null
        ? t("board.pickActor")
        : mode === "TECHNIQUE" && techniqueKind === "ALLY"
          ? t("board.pickAlly")
          : t("board.pickTarget");

  const cost = technique ? setup.rules.techniques[technique].cost : 0;

  return (
    <>
      <BoardLayout
        setup={setup}
        shown={shown}
        fx={player.fx}
        lunge={player.lunge}
        mySide={mySide}
        players={view.players as BattleView["players"]}
        theirs={{ targets: enemyTargets, onPress: pressTheirs }}
        mine={{ selected, ready: canAct && selected === null ? ready : undefined, targets: allyTargets, onPress: pressMine }}
        middle={
          <>
            <span className="flex min-w-0 flex-col">
              <span className={`text-sm font-bold ${myTurn ? "text-kin" : ""}`} aria-live="polite">
                {shown.finished ? t(`result.${shown.winner === null ? "DRAW" : shown.winner === mySide ? "WIN" : "LOSS"}`) : myTurn ? t("board.yourTurn") : t("board.theirTurn", { name: name(view.players[opp]) })}
              </span>
              <span className="text-xs text-text-muted">{t("board.turn", { turn: Math.ceil(shown.turn / 2) })}</span>
            </span>
            <Orbs count={shown.orbs} max={setup.rules.orbs.max} label={t("board.orbs", { count: shown.orbs })} />
            <TurnTimer secondsLeft={secondsLeft} total={view.turnSeconds} />
          </>
        }
        controls={
          <div className="flex flex-col gap-2 pb-[env(safe-area-inset-bottom)]">
            <p className="min-h-5 text-center text-xs text-text-muted">{error ?? hint}</p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={mode === "ATTACK" && selected !== null ? "shu" : "neutral"}
                disabled={!canAct || selected === null}
                onClick={() => setMode("ATTACK")}
              >
                {t("board.attack")}
              </Button>
              <Button
                variant={mode === "TECHNIQUE" ? "shu" : "neutral"}
                disabled={!canAct || techniqueActions.length === 0}
                onClick={pressTechnique}
                title={technique ? t(`techniques.${technique}.name`) : undefined}
              >
                <span lang="ja" aria-hidden="true" className="font-seal">
                  技
                </span>
                {technique ? t("board.technique", { name: t(`techniques.${technique}.name`), cost }) : t("board.techniqueLabel")}
              </Button>
            </div>
            {technique && (
              <p className="text-center text-xs text-text-muted">
                {t(`techniques.${technique}.desc`, {
                  mult: (setup.rules.techniques[technique].value / 100).toLocaleString(),
                  pct: setup.rules.techniques[technique].value,
                })}
              </p>
            )}
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Button variant="shu" disabled={!canAct} onClick={() => void send({ type: "END_TURN" })}>
                {t("board.endTurn")}
              </Button>
              <Button disabled={shown.finished || pending} onClick={() => setConfirmForfeit(true)}>
                {t("board.forfeit")}
              </Button>
            </div>
          </div>
        }
      />

      <Sheet open={confirmForfeit} onClose={() => setConfirmForfeit(false)} title={t("board.forfeit")}>
        <p className="text-sm">{t("board.forfeitConfirm")}</p>
        <div className="flex justify-end gap-2">
          <Button onClick={() => setConfirmForfeit(false)}>{t("board.cancel")}</Button>
          <Button
            variant="shu"
            onClick={() => {
              setConfirmForfeit(false);
              void send({ type: "FORFEIT" });
            }}
          >
            {t("board.forfeitYes")}
          </Button>
        </div>
      </Sheet>

      {final.finished && shown.finished && !animating && (
        <BattleResult
          winner={shown.winner}
          mySide={mySide}
          reason={shown.endReason}
          rewardZeni={final.rewardZeni}
          onReplay={() => router.refresh()}
        />
      )}
    </>
  );
}
