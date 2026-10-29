"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { applyAction, createState, other } from "@/lib/battle/engine";
import type { Action, BattleSetup, BattleState } from "@/lib/battle/types";
import type { BattleView } from "@/lib/battle/view";
import { LADDER, rankOf } from "@/lib/ranked/rules";
import { RankedResult } from "../ranked/RankedResult";
import { BattleResult } from "./BattleResult";
import { useLogLine } from "./BattleLog";
import { StageMenu } from "./hud/StageMenu";
import { Intro } from "./sequences/Intro";
import { BattleStage } from "./stage/BattleStage";
import { useStageKit } from "./stage/useStageKit";

/**
 * Replay d'une partie terminée, sur la scène plein écran : le moteur rejoue setup + graine + journal
 * dans le navigateur (même graine = mêmes chiffres), puis anime les événements action par action.
 */
export function BattleReplay({ view }: { view: BattleView & { setup: BattleSetup; state: BattleState } }) {
  const t = useTranslations("battle");
  // Étape 0 : ouverture de la partie ; étape i : action i − 1. État après chaque étape, en une passe.
  const { steps, finals } = useMemo(() => {
    let { state, events } = createState(view.setup);
    const steps = [events];
    const finals = [state];
    for (const action of (view.actions ?? []) as Action[]) {
      ({ state, events } = applyAction(view.setup, view.seed, state, action));
      steps.push(events);
      finals.push(state);
    }
    return { steps, finals };
  }, [view.actions, view.seed, view.setup]);

  const { setup, mySide } = view;
  const { arena, level, speed, sound, arenaRef, director } = useStageKit(finals[0], { setup, mySide, tier: view.tier });
  const { play, snap, animating } = director;
  const [intro, setIntro] = useState(true);
  const [index, setIndex] = useState(0); // dernière étape jouée
  const [playing, setPlaying] = useState(true);
  const [resultHidden, setResultHidden] = useState(false);
  const total = steps.length - 1;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const line = useLogLine(setup, view.players);

  // Lecture automatique : étape suivante dès que l'animation de la précédente est finie
  useEffect(() => {
    if (intro || !playing || animating || index >= total) return;
    timer.current = setTimeout(() => {
      const next = index + 1;
      play(steps[next], finals[next]);
      setIndex(next);
    }, 350);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [animating, finals, index, intro, play, playing, steps, total]);

  const step = () => {
    if (index >= total || animating) return;
    setPlaying(false);
    play(steps[index + 1], finals[index + 1]);
    setIndex(index + 1);
  };
  const toEnd = () => {
    setPlaying(false);
    snap(finals[total]);
    setIndex(total);
  };
  const restart = () => {
    snap(finals[0]);
    setIndex(0);
    setResultHidden(false);
    setPlaying(true);
  };
  // Résultat affiché une fois la dernière action animée
  const showResult = index >= total && !animating && !resultHidden;

  // Bilan classé relu de la partie (montée ou descente déduite des PC ; le top 100 n'est pas rejoué)
  const before = view.ranked?.before[mySide] ?? null;
  const delta = view.ranked?.delta[mySide] ?? null;
  const rankedSide =
    before !== null && delta !== null && view.ladder
      ? (() => {
          const ladder = view.ladder!;
          const idx = (pc: number) => LADDER.indexOf(rankOf(pc, false, ladder).tier as (typeof LADDER)[number]);
          return { before, after: before + delta, delta, promoted: idx(before + delta) > idx(before), demoted: idx(before + delta) < idx(before), saved: false, protection: 0, grandBefore: false, grandAfter: false };
        })()
      : null;

  const last = [...director.feed].reverse().find((f) => line(f.event));
  const progress = t("replay.progress", { n: index, total });

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
        ticker={{ text: last ? line(last.event) : progress, tone: "hint" }}
        menu={
          <StageMenu sound={{ enabled: sound.enabled, set: sound.setEnabled }} music={{ enabled: sound.music, set: sound.setMusic }} speed={speed}>
            <p className="menu-row" aria-live="polite">
              <span>{progress}</span>
            </p>
            <button type="button" className="menu-row" onClick={() => (index >= total ? restart() : setPlaying(!playing))}>
              <span>{index >= total ? t("replay.restart") : playing ? t("replay.pause") : t("replay.play")}</span>
            </button>
            <button type="button" className="menu-row" disabled={index >= total || animating} onClick={step}>
              <span>{t("replay.step")}</span>
            </button>
            <button type="button" className="menu-row" disabled={index >= total} onClick={toEnd}>
              <span>{t("replay.end")}</span>
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
              deal={() => director.deal([other(mySide), mySide].flatMap((side) => [0, 1, 2].map((index) => ({ side, index }))))}
              finishDeal={director.finishDeal}
              onDone={() => setIntro(false)}
              sound={sound.port}
            />
          ) : null
        }
      />
      {showResult && (
        <BattleResult
          winner={view.winnerSide}
          mySide={mySide}
          reason={view.endReason}
          rewardZeni={view.rewardZeni}
          onReplay={restart}
          requeueId={view.mode === "FRIEND" ? undefined : view.id}
          ranked={
            rankedSide && view.ladder ? (
              <RankedResult
                side={rankedSide}
                won={view.winnerSide === null ? null : view.winnerSide === mySide}
                crushing={view.ranked!.crushing}
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
