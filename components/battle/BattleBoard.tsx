"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { legalActions, other } from "@/lib/battle/engine";
import { TECHNIQUE_TARGET, type Action, type BattleSetup, type BattleState } from "@/lib/battle/types";
import type { BattleUpdateView, BattleView, RankedOutcomeView } from "@/lib/battle/view";
import { battleSinceAction, claimTimeoutAction, playAction } from "@/server/actions/battle";
import type { ClientAction } from "@/server/battle/battle-core";
import { useHoldAwake } from "../realtime/activity";
import { useRealtime } from "../realtime/RealtimeProvider";
import { usePoll } from "../realtime/usePoll";
import { Button } from "../ui/Button";
import { Sheet } from "../ui/Sheet";
import { RankedResult } from "../ranked/RankedResult";
import { BattleResult } from "./BattleResult";
import { BattleLog, CardDetail } from "./BattleLog";
import { BoardLayout, Medallion, Orbs, usePlayerName } from "./BoardLayout";
import { TurnTimer, useSecondsLeft } from "./TurnTimer";
import { useBattleError } from "./useBattleError";
import { useEventPlayer } from "./useEventPlayer";

type Mode = "ATTACK" | "TECHNIQUE";

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
  const [final, setFinal] = useState<{ finished: boolean; rewardZeni: number; ranked: RankedOutcomeView | null }>({
    finished: false,
    rewardZeni: 0,
    ranked: null,
  });
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
      if (u.finished) setFinal({ finished: true, rewardZeni: u.rewardZeni, ranked: u.ranked });
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

  // Temps réel (connexion Ably partagée) si configuré, sinon sondage ; rien onglet caché, rattrapage
  // au retour et à chaque reconnexion
  const live = !final.finished;
  const { connected, subscribe } = useRealtime();
  useHoldAwake(live);
  usePoll(resync, { seconds: view.pollSeconds, realtimeSeconds: view.realtime ? view.safetyPollSeconds : undefined, enabled: live });
  useEffect(() => {
    if (!live || !view.realtime) return;
    return subscribe({ battle: view.id }, "update", (data) => receive(data as BattleUpdateView));
  }, [live, receive, subscribe, view.id, view.realtime]);
  // Abonnement tout juste posé : un coup joué pendant ce temps aurait pu passer entre les mailles
  const primed = useRef(false);
  useEffect(() => {
    if (!live || !connected || primed.current) return;
    primed.current = true;
    const id = setTimeout(() => void resync(), 2_000);
    return () => clearTimeout(id);
  }, [connected, live, resync]);

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

  const hint = shown.finished
    ? null
    : !myTurn
      ? t("board.waitOpponent")
      : ready.size === 0
        ? t("board.noActions")
        : selected === null
          ? t("board.pickActor")
          : mode === "TECHNIQUE" && techniqueKind === "ALLY"
            ? t("board.pickAlly")
            : t("board.pickTarget");

  const cost = technique ? setup.rules.techniques[technique].cost : 0;
  const timer = <TurnTimer secondsLeft={secondsLeft} total={view.turnSeconds} />;
  const orbs = (n: number) => <Orbs count={n} max={setup.rules.orbs.max} label={t("board.orbs", { count: n })} />;
  const endTurn = (
    <button
      type="button"
      disabled={!canAct}
      onClick={() => void send({ type: "END_TURN" })}
      className={`battle-rim flex size-24 items-center justify-center rounded-full p-[3px] transition-transform active:scale-95 disabled:opacity-40 ${
        canAct && ready.size === 0 ? "animate-pulse" : ""
      }`}
    >
      <span className="flex size-full items-center justify-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#ff7a5f,#C8372D_55%,#7d1a14)] px-2 text-center text-sm leading-tight font-bold text-washi-paper">
        {t("board.endTurn")}
      </span>
    </button>
  );
  const detailCard = selected !== null ? setup.teams[mySide][selected] : null;

  return (
    <>
      <BoardLayout
        setup={setup}
        shown={shown}
        fx={player.fx}
        mySide={mySide}
        players={view.players}
        tier={view.tier}
        boardRef={player.boardRef}
        cardRef={player.cardRef}
        theirs={{ targets: enemyTargets, onPress: pressTheirs }}
        mine={{ selected, ready: canAct && selected === null ? ready : undefined, targets: allyTargets, onPress: pressMine }}
        theirPlate={!shown.finished && shown.active === opp ? <>{orbs(shown.orbs)}{timer}</> : null}
        myPlate={!shown.finished && shown.active === mySide ? <>{orbs(shown.orbs)}{timer}</> : null}
        front={
          <>
            <Medallion highlight={myTurn}>
              <span className="text-[9px] text-[#a89f92] md:text-[10px]">{t("board.turnShort")}</span>
              <span className="font-title text-lg font-extrabold tabular-nums md:text-2xl">{Math.ceil(shown.turn / 2)}</span>
            </Medallion>
            {/* Bannière qui traverse le plateau à chaque changement de tour */}
            {!shown.finished && (
              <span
                key={`${shown.turn}-${shown.active}`}
                aria-live="polite"
                className={`battle-banner pointer-events-none absolute top-1/2 left-1/2 w-max -translate-x-1/2 -translate-y-1/2 rounded-md border px-5 py-1.5 font-title text-lg font-extrabold md:text-2xl ${
                  myTurn ? "border-[var(--board-accent)] bg-[#2b1a10] text-kin" : "border-[#4a3f33] bg-[#15120f] text-washi-paper"
                }`}
              >
                {myTurn ? t("board.yourTurn") : t("board.theirTurn", { name: name(view.players[opp]) })}
              </span>
            )}
          </>
        }
        frontAction={endTurn}
        side={
          <>
            <CardDetail card={detailCard} hp={detailCard ? shown.fighters[mySide][selected!].hp : 0} maxHp={detailCard ? shown.fighters[mySide][selected!].maxHp : 0} rules={setup.rules} />
            <BattleLog feed={player.feed} setup={setup} players={view.players} />
          </>
        }
        controls={
          <div className="flex flex-col gap-2 pb-[env(safe-area-inset-bottom)] lg:rounded-card lg:border lg:border-border lg:bg-surface lg:p-4">
            <p className={`min-h-6 text-center text-sm font-medium ${error ? "text-shu" : myTurn ? "text-kin" : "text-text-muted"}`} aria-live="polite">
              {error ?? hint}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={mode === "ATTACK" && selected !== null ? "primary" : "secondary"}
                disabled={!canAct || selected === null}
                onClick={() => setMode("ATTACK")}
              >
                {t("board.attack")}
              </Button>
              <Button
                variant={mode === "TECHNIQUE" ? "primary" : "secondary"}
                disabled={!canAct || techniqueActions.length === 0}
                onClick={pressTechnique}
                className="min-w-0 px-2 py-2 text-sm"
                title={technique ? t(`techniques.${technique}.name`) : undefined}
              >
                {technique ? t("board.technique", { name: t(`techniques.${technique}.name`), cost }) : t("board.techniqueLabel")}
              </Button>
            </div>
            {technique && (
              <p className="text-center text-xs text-text-muted lg:hidden">
                {t(`techniques.${technique}.desc`, {
                  mult: (setup.rules.techniques[technique].value / 100).toLocaleString(),
                  pct: setup.rules.techniques[technique].value,
                })}
              </p>
            )}
            <div className="grid grid-cols-[1fr_auto] gap-2 md:grid-cols-[auto] md:justify-end">
              <Button variant="primary" className="md:hidden" disabled={!canAct} onClick={() => void send({ type: "END_TURN" })}>
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
            variant="primary"
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
          requeueId={view.mode === "FRIEND" ? undefined : view.id}
          ranked={
            final.ranked?.sides[mySide] && view.ladder ? (
              <RankedResult
                side={final.ranked.sides[mySide]!}
                won={shown.winner === null ? null : shown.winner === mySide}
                crushing={final.ranked.crushing}
                ladder={view.ladder}
                bot={view.players[1] !== null && "bot" in view.players[1]}
              />
            ) : null
          }
        />
      )}
    </>
  );
}
