"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { applyAction, createState } from "@/lib/battle/engine";
import type { Action, BattleSetup, BattleState } from "@/lib/battle/types";
import type { BattleView } from "@/lib/battle/view";
import { Button, buttonClasses } from "../ui/Button";
import { LADDER, rankOf } from "@/lib/ranked/rules";
import { RankedResult } from "../ranked/RankedResult";
import { BattleResult } from "./BattleResult";
import { BattleLog } from "./BattleLog";
import { BoardLayout, Medallion, Orbs } from "./BoardLayout";
import { useEventPlayer } from "./useEventPlayer";

/**
 * Replay d'une partie terminée : le moteur rejoue setup + graine + journal dans le navigateur
 * (même graine = mêmes chiffres), puis anime les événements action par action.
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

  const player = useEventPlayer(finals[0]);
  const { play, snap, animating } = player;
  const [index, setIndex] = useState(0); // dernière étape jouée
  const [playing, setPlaying] = useState(true);
  const [resultHidden, setResultHidden] = useState(false);
  const total = steps.length - 1;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Lecture automatique : étape suivante dès que l'animation de la précédente est finie
  useEffect(() => {
    if (!playing || animating || index >= total) return;
    timer.current = setTimeout(() => {
      const next = index + 1;
      play(steps[next], finals[next]);
      setIndex(next);
    }, 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [animating, finals, index, play, playing, steps, total]);

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

  const shown = player.shown;
  // Bilan classé relu de la partie (montée ou descente déduite des PC ; le top 100 n'est pas rejoué)
  const before = view.ranked?.before[view.mySide] ?? null;
  const delta = view.ranked?.delta[view.mySide] ?? null;
  const rankedSide =
    before !== null && delta !== null && view.ladder
      ? (() => {
          const ladder = view.ladder!;
          const idx = (pc: number) => LADDER.indexOf(rankOf(pc, false, ladder).tier as (typeof LADDER)[number]);
          return { before, after: before + delta, delta, promoted: idx(before + delta) > idx(before), demoted: idx(before + delta) < idx(before), saved: false, protection: 0, grandBefore: false, grandAfter: false };
        })()
      : null;
  const orbs = <Orbs count={shown.orbs} max={view.setup.rules.orbs.max} label={t("board.orbs", { count: shown.orbs })} />;
  return (
    <>
      <BoardLayout
        setup={view.setup}
        shown={shown}
        fx={player.fx}
        mySide={view.mySide}
        players={view.players}
        tier={view.tier}
        boardRef={player.boardRef}
        cardRef={player.cardRef}
        myPlate={shown.active === view.mySide ? orbs : null}
        theirPlate={shown.active !== view.mySide ? orbs : null}
        front={
          <Medallion highlight>
            <span className="text-[9px] text-[#a89f92] md:text-[10px]">{t("replay.title")}</span>
            <span className="font-title text-sm font-extrabold tabular-nums md:text-base">
              {index}/{total}
            </span>
          </Medallion>
        }
        side={<BattleLog feed={player.feed} setup={view.setup} players={view.players} />}
        controls={
          <div className="flex flex-col gap-2">
            <p className="text-center text-xs tabular-nums text-text-muted" aria-live="polite">
              {t("replay.progress", { n: index, total })}
            </p>
            <div className="grid grid-cols-3 gap-2">
              <Button onClick={() => (index >= total ? restart() : setPlaying(!playing))}>
                {index >= total ? t("replay.restart") : playing ? t("replay.pause") : t("replay.play")}
              </Button>
              <Button onClick={step} disabled={index >= total || animating}>
                {t("replay.step")}
              </Button>
              <Button onClick={toEnd} disabled={index >= total}>
                {t("replay.end")}
              </Button>
            </div>
            <Link href="/combat" className={buttonClasses("secondary")}>
              {t("result.back")}
            </Link>
          </div>
        }
      />
      {showResult && (
        <BattleResult
          winner={view.winnerSide}
          mySide={view.mySide}
          reason={view.endReason}
          rewardZeni={view.rewardZeni}
          onReplay={restart}
          ranked={rankedSide && view.ladder ? (
            <RankedResult
              side={rankedSide}
              won={view.winnerSide === null ? null : view.winnerSide === view.mySide}
              crushing={view.ranked!.crushing}
              ladder={view.ladder}
              bot={view.players[1] !== null && "bot" in view.players[1]}
            />
          ) : null}
        />
      )}
    </>
  );
}
