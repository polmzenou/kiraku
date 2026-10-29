"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { other } from "@/lib/battle/engine";
import type { Action, BattleSetup, BattleState } from "@/lib/battle/types";
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
import { useLogLine } from "./BattleLog";
import { Tablets } from "./hud/Hud";
import { StageMenu } from "./hud/StageMenu";
import { Intro } from "./sequences/Intro";
import { Outro } from "./sequences/Outro";
import { BattleStage } from "./stage/BattleStage";
import { useBoardControls } from "./stage/useBoardControls";
import { useStageKit } from "./stage/useStageKit";
import { useSecondsLeft } from "./TurnTimer";
import { useBattleError } from "./useBattleError";

function toClient(a: Action): ClientAction {
  if (a.type === "ATTACK") return { type: "ATTACK", actor: a.actor, target: a.target };
  if (a.type === "TECHNIQUE") return a.target === undefined ? { type: "TECHNIQUE", actor: a.actor } : { type: "TECHNIQUE", actor: a.actor, target: a.target };
  return { type: a.type === "FORFEIT" ? "FORFEIT" : "END_TURN" };
}

/**
 * Partie en direct, sur la scène plein écran. Le client n'envoie que des intentions (version vue +
 * action) ; chaque réponse ou message temps réel apporte les événements à animer et l'état qui fait
 * foi. Une mise à jour qui ne part pas de notre version déclenche une resynchronisation depuis le journal.
 */
export function BattleBoard({ view }: { view: BattleView & { setup: BattleSetup; state: BattleState } }) {
  const t = useTranslations("battle");
  const router = useRouter();
  const { setup, mySide } = view;
  const opp = other(mySide);
  const { arena, level, speed, sound, arenaRef, director } = useStageKit(view.state, { setup, mySide, tier: view.tier });
  const { shown, animating, play } = director;

  const version = useRef(view.version);
  const [turnEndsAt, setTurnEndsAt] = useState(view.turnEndsAt);
  const [final, setFinal] = useState<{ finished: boolean; rewardZeni: number; ranked: RankedOutcomeView | null }>({
    finished: false,
    rewardZeni: 0,
    ranked: null,
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmForfeit, setConfirmForfeit] = useState(false);
  // Entrée seulement en début de partie : une partie reprise s'ouvre directement sur le plateau
  const [intro, setIntro] = useState(view.state.turn <= 1 && !view.state.finished);
  const claimed = useRef<string | null>(null);
  const errorText = useBattleError();
  const syncing = useRef(false);
  const line = useLogLine(setup, view.players);

  const apply = useCallback(
    (u: BattleUpdateView) => {
      version.current = u.version;
      setTurnEndsAt(u.turnEndsAt);
      if (u.finished) setFinal({ finished: true, rewardZeni: u.rewardZeni, ranked: u.ranked });
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
    } catch {
      // Serveur injoignable : le prochain sondage réessaiera
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
  const { isLive, subscribe } = useRealtime();
  // En direct seulement si le canal de la partie est attaché (jeton refusé ou quota Ably : sondage normal)
  const connected = isLive({ battle: view.id });
  useHoldAwake(live);
  usePoll(resync, {
    seconds: view.pollSeconds,
    realtimeSeconds: view.realtime ? view.safetyPollSeconds : undefined,
    channel: { battle: view.id },
    enabled: live,
  });
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

  const canAct = !intro && !shown.finished && shown.active === mySide && !animating && !pending;

  // Minuteur : à zéro, n'importe quel joueur réclame la fin du tour (le serveur vérifie l'échéance)
  const secondsLeft = useSecondsLeft(shown.finished ? null : turnEndsAt, 0);
  useEffect(() => {
    if (secondsLeft === null || secondsLeft > 0 || !turnEndsAt || claimed.current === turnEndsAt || animating) return;
    claimed.current = turnEndsAt;
    const id = setTimeout(async () => {
      const res = await claimTimeoutAction({ battleId: view.id }).catch(() => null);
      // Action qui lève (serveur injoignable) : réclamation rouverte pour le prochain passage
      if (!res) claimed.current = null;
      if (res?.ok && res.update) receive(res.update);
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

  const controls = useBoardControls({ setup, shown, mySide, canAct, send: (a) => void send(toClient(a)) });

  // Fin : le verdict au pinceau, puis le résultat (tout de suite en mouvement réduit)
  const over = final.finished && shown.finished && !animating;
  const [resultReady, setResultReady] = useState(false);
  useEffect(() => {
    if (!over) return;
    const id = setTimeout(() => setResultReady(true), level === "reduced" ? 0 : 2_200);
    return () => clearTimeout(id);
  }, [level, over]);

  const last = [...director.feed].reverse().find((f) => line(f.event));
  const hint = controls.hint ? t(`board.${controls.hint}`) : null;
  const ticker = error
    ? { text: error, tone: "error" as const }
    : canAct && hint
      ? { text: hint, tone: "mine" as const }
      : { text: last ? line(last.event) : (hint ?? t("log.empty")), tone: "hint" as const };
  const outcome = shown.winner === null ? "draw" : shown.winner === mySide ? "victory" : "defeat";
  const reason = shown.endReason ? t(`result.reason.${shown.endReason === "KO" && shown.winner !== mySide ? "KO_LOSS" : shown.endReason}`) : null;

  return (
    <div className="fixed inset-0 z-[45]">
      <BattleStage
        setup={setup}
        director={director}
        mySide={mySide}
        players={view.players}
        tier={view.tier}
        tiers={[view.tier, view.tier]}
        arena={arena}
        level={level}
        arenaRef={arenaRef}
        sound={sound.port}
        mine={{ selected: controls.selected, ready: controls.selected === null && canAct ? controls.ready : undefined, targets: controls.allyTargets, onPress: controls.pressMine }}
        theirs={{ targets: controls.enemyTargets, onPress: controls.pressTheirs }}
        ticker={ticker}
        timer={!intro && !shown.finished ? { secondsLeft, total: view.turnSeconds } : null}
        tablets={
          <Tablets
            mode={controls.mode}
            attack={{ enabled: canAct && controls.selected !== null, onPress: () => controls.setMode("ATTACK") }}
            technique={{ technique: controls.technique, cost: controls.cost, enabled: controls.techniqueEnabled, onPress: controls.pressTechnique }}
            end={{ enabled: canAct, pulse: controls.ready.size === 0, onPress: controls.endTurn }}
          />
        }
        menu={
          <StageMenu sound={{ enabled: sound.enabled, set: sound.setEnabled }} music={{ enabled: sound.music, set: sound.setMusic }} speed={speed}>
            <button type="button" className="menu-row" disabled={shown.finished || pending} onClick={() => setConfirmForfeit(true)}>
              <span>{t("board.forfeit")}</span>
            </button>
            <Link href="/combat" className="menu-row">
              <span>{t("result.back")}</span>
            </Link>
          </StageMenu>
        }
        overlay={
          intro ? (
            <Intro
              arena={arena}
              players={view.players}
              mySide={mySide}
              tiers={[view.tier, view.tier]}
              first={setup.first}
              level={level}
              deal={() => director.deal([opp, mySide].flatMap((side) => [0, 1, 2].map((index) => ({ side, index }))))}
              finishDeal={director.finishDeal}
              onDone={() => setIntro(false)}
              sound={sound.port}
            />
          ) : over ? (
            <Outro outcome={outcome} reason={reason} level={level}>
              {null}
            </Outro>
          ) : null
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

      {over && resultReady && (
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
    </div>
  );
}
