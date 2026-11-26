"use client";

import { animate, domAnimation, LazyMotion, m, useMotionValue, useTransform } from "motion/react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Fuda } from "@/components/fuda/Fuda";
import { FlipCard } from "@/components/opening/RevealCard";
import { Link } from "@/i18n/navigation";
import type { ExpeditionOutcome } from "@/lib/expedition/types";
import type { ExpeditionResultView } from "@/lib/expedition/view";
import { playSound, primeAudio, vibrate } from "@/lib/sound/synth";
import { Button } from "../ui/Button";
import { ZeniCoin } from "../layout/ZeniCoin";

type Phase = "letter" | "open" | "rewards";

const STAMP: Record<ExpeditionOutcome, { kanji: string; ring: string; text: string; glow: string }> = {
  TRIUMPH: { kanji: "大成功", ring: "border-kin", text: "text-kin", glow: "rgb(217 181 86 / 0.55)" },
  SUCCESS: { kanji: "成功", ring: "border-shu", text: "text-shu", glow: "rgb(224 83 63 / 0.45)" },
  FAILURE: { kanji: "失敗", ring: "border-text-muted", text: "text-text-muted", glow: "rgb(168 159 146 / 0.25)" },
};

/** Zeni qui défilent jusqu'au gain, sans rendu React à chaque image. */
function ZeniCount({ value, reduced }: { value: number; reduced: boolean }) {
  const format = useFormatter();
  const count = useMotionValue(reduced ? value : 0);
  const shown = useTransform(count, (v) => format.number(Math.round(v)));
  useEffect(() => {
    if (reduced) return;
    const controls = animate(count, value, { duration: 1.1, ease: "easeOut" });
    return () => controls.stop();
  }, [count, value, reduced]);
  return <m.span>{shown}</m.span>;
}

/** Paillettes d'or du triomphe (transform et opacity seulement). */
function GoldBurst() {
  return (
    <>
      {Array.from({ length: 14 }, (_, i) => {
        const angle = (i / 14) * Math.PI * 2;
        const r = 110 + (i % 3) * 30;
        return (
          <m.span
            key={i}
            aria-hidden="true"
            className="absolute top-1/2 left-1/2 size-2 rounded-[2px] bg-kin"
            initial={{ x: 0, y: 0, opacity: 1, scale: 1, rotate: 0 }}
            animate={{ x: Math.cos(angle) * r, y: Math.sin(angle) * r, opacity: 0, scale: 0.4, rotate: 180 }}
            transition={{ duration: 1.1, ease: "easeOut", delay: 0.05 * (i % 4) }}
          />
        );
      })}
    </>
  );
}

/**
 * Rapport d'une expédition rentrée, plein écran (chargé à la demande). Une lettre scellée arrive ;
 * un appui brise le cachet, le papier se déplie et le tampon de l'issue tombe (大成功 · 成功 · 失敗),
 * puis les gains défilent et les trois cartes reviennent. À la fermeture, le résultat est marqué vu.
 */
export function ResultReveal({ result, reduced, onClose }: { result: ExpeditionResultView; reduced: boolean; onClose: () => void }) {
  const t = useTranslations("expedition.result");
  const tOutcome = useTranslations("expedition.outcome");
  const tReward = useTranslations("expedition.reward");
  const dialog = useRef<HTMLDialogElement>(null);
  const [phase, setPhase] = useState<Phase>(reduced ? "rewards" : "letter");
  const stamp = STAMP[result.outcome];
  const opened = phase !== "letter";
  const showRewards = phase === "rewards";
  // Tout ce que le lot bonus a versé : ses cartes (toutes), ses Zeni (ajoutés au total) et ses boosters
  const bonus = result.bonusCards;
  const zeni = result.reward.zeni + result.lotZeni;
  const [bonusFront, setBonusFront] = useState(reduced);
  const fanned = Math.min(5, result.reward.boosters);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  // Cachet brisé → tampon de l'issue → gains
  useEffect(() => {
    if (phase !== "open") return;
    const stampAt = setTimeout(() => {
      playSound(result.outcome === "FAILURE" ? "clack" : "stamp", 0.8);
      if (result.outcome === "TRIUMPH") setTimeout(() => playSound("chime", 0.6), 180);
      vibrate(result.outcome === "FAILURE" ? 15 : [25, 50, 40]);
    }, 450);
    const rewardsAt = setTimeout(() => setPhase("rewards"), 1300);
    return () => {
      clearTimeout(stampAt);
      clearTimeout(rewardsAt);
    };
  }, [phase, result.outcome]);

  const hasBonus = bonus.length > 0;
  useEffect(() => {
    if (!showRewards || !hasBonus || reduced) return;
    const id = setTimeout(() => {
      setBonusFront(true);
      playSound("flip", 0.5);
    }, 900);
    return () => clearTimeout(id);
  }, [showRewards, hasBonus, reduced]);

  const breakSeal = () => {
    if (phase !== "letter") return;
    primeAudio();
    playSound("tear", 0.5);
    setPhase("open");
  };

  const item = (i: number) =>
    reduced
      ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.2 } }
      : { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.15 + i * 0.18, type: "spring" as const, stiffness: 220, damping: 22 } };

  return (
    <dialog
      ref={dialog}
      aria-label={t("title", { name: result.name })}
      onClose={onClose}
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none overflow-x-hidden overflow-y-auto bg-transparent p-0 text-washi-paper backdrop:bg-[#0b0a12]/[.97]"
    >
      <LazyMotion features={domAnimation} strict>
        <m.span
          aria-hidden="true"
          className="pointer-events-none fixed inset-0"
          style={{ background: `radial-gradient(circle at 50% 35%, ${stamp.glow} 0%, transparent 60%)` }}
          initial={{ opacity: 0 }}
          animate={{ opacity: opened ? 1 : 0.2 }}
          transition={{ duration: reduced ? 0 : 0.8 }}
        />
        <div className="relative mx-auto flex min-h-full max-w-md flex-col items-center justify-center gap-6 px-6 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
          <p className="text-center text-sm font-bold tracking-wide text-washi-paper/70">{result.name}</p>

          {/* Lettre : cachet, puis papier déplié et tampon */}
          <div className="relative flex h-56 w-full max-w-[18rem] items-center justify-center">
            {!opened && (
              <m.button
                type="button"
                onClick={breakSeal}
                className="exp-call relative flex h-44 w-60 items-center justify-center rounded-md bg-[linear-gradient(160deg,#f6eedd,#e8dcc2)] text-sumi shadow-[0_18px_40px_rgb(0_0_0/0.5)]"
                initial={{ y: -40, opacity: 0, rotate: -6 }}
                animate={{ y: 0, opacity: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 160, damping: 16 }}
                autoFocus
              >
                <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1/2 origin-top [clip-path:polygon(0_0,100%_0,50%_100%)] bg-[#dccfb3]" />
                <span aria-hidden="true" lang="ja" className="relative inline-flex size-14 items-center justify-center rounded-full bg-shu-btn font-seal text-xl text-washi-paper shadow-[0_3px_10px_rgb(120_20_10/0.5)]">
                  封
                </span>
                <span className="absolute -bottom-9 text-xs font-bold text-washi-paper/80">{t("breakSeal")}</span>
              </m.button>
            )}

            {opened && (
              <m.div
                className="relative flex h-52 w-64 flex-col items-center justify-center rounded-md bg-[linear-gradient(170deg,#f8f1e3,#ebdfc6)] text-sumi shadow-[0_18px_40px_rgb(0_0_0/0.5)]"
                initial={reduced ? { opacity: 0 } : { scaleY: 0.25, opacity: 0.6 }}
                animate={{ scaleY: 1, opacity: 1 }}
                transition={reduced ? { duration: 0.2 } : { type: "spring", stiffness: 200, damping: 20 }}
                style={{ originY: 0 }}
              >
                {result.outcome === "TRIUMPH" && !reduced && <GoldBurst />}
                <m.span
                  aria-hidden="true"
                  lang="ja"
                  className={`inline-flex items-center justify-center rounded-[14px] border-4 px-3 py-2 font-seal text-4xl leading-none [writing-mode:vertical-rl] ${stamp.ring} ${stamp.text}`}
                  initial={reduced ? { opacity: 0 } : { scale: 2.2, opacity: 0, rotate: -18 }}
                  animate={{ scale: 1, opacity: 1, rotate: -6 }}
                  transition={reduced ? { duration: 0.2 } : { type: "spring", stiffness: 600, damping: 17, delay: 0.4 }}
                >
                  {stamp.kanji}
                </m.span>
                <m.p className="mt-3 font-title text-xl font-extrabold" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: reduced ? 0 : 0.8 }}>
                  {tOutcome(result.outcome)}
                </m.p>
              </m.div>
            )}
          </div>

          {showRewards && (
            <div className="flex w-full flex-col items-center gap-4" aria-live="polite">
              <m.p {...item(0)} className="max-w-xs text-center text-sm text-washi-paper/80">
                {t(`body.${result.outcome}`)}
              </m.p>
              <ul className="flex w-full flex-col gap-2">
                {zeni > 0 && (
                  <m.li {...item(1)} className="flex items-center justify-between rounded-control bg-washi-paper/10 px-4 py-3">
                    <span className="flex items-center gap-2 text-sm">
                      <ZeniCoin size={20} />
                      {t("zeni")}
                    </span>
                    <span className="font-heading text-2xl tabular-nums text-kin">
                      +<ZeniCount value={zeni} reduced={reduced} />
                    </span>
                  </m.li>
                )}
                {result.reward.boosters > 0 && (
                  <m.li {...item(2)} className="flex items-center justify-between gap-3 rounded-control bg-washi-paper/10 px-4 py-3">
                    <span className="flex min-w-0 flex-col text-sm">
                      {tReward("boosters", { count: result.reward.boosters })}
                      <span className="truncate text-xs text-washi-paper/60">{result.boosterName}</span>
                    </span>
                    {/* Sachets en éventail */}
                    <span className="relative flex h-12 w-24 shrink-0 items-end justify-center">
                      {Array.from({ length: fanned }, (_, i) => {
                        const offset = i - (fanned - 1) / 2;
                        return (
                          <m.span
                            key={i}
                            aria-hidden="true"
                            className="absolute bottom-0 h-11 w-7 origin-bottom rounded-[3px] bg-[linear-gradient(170deg,#e0533f,#8f2219)] shadow-[0_2px_6px_rgb(0_0_0/0.4)]"
                            initial={reduced ? false : { rotate: 0, y: 20, opacity: 0 }}
                            animate={{ rotate: offset * 14, x: offset * 10, y: 0, opacity: 1 }}
                            transition={{ type: "spring", stiffness: 220, damping: 18, delay: 0.45 + i * 0.06 }}
                          >
                            <span className="absolute inset-x-1.5 top-2.5 h-4 rounded-[2px] bg-washi-paper/85" />
                          </m.span>
                        );
                      })}
                    </span>
                  </m.li>
                )}
                {result.lotBoosters > 0 && (
                  <m.li {...item(2)} className="flex items-center justify-between gap-3 rounded-control bg-washi-paper/10 px-4 py-3 text-sm">
                    {tReward("bonusBoosters", { count: result.lotBoosters })}
                  </m.li>
                )}
              </ul>

              {hasBonus && (
                <m.div {...item(3)} className="flex w-full flex-col items-center gap-2">
                  <span className="text-xs font-bold tracking-wide text-kin uppercase">{t("bonusCard", { count: bonus.length })}</span>
                  {/* Une carte : grande ; plusieurs : petite grille, toutes retournées ensemble */}
                  <ul className={bonus.length === 1 ? "w-36" : "grid w-full max-w-[16rem] grid-cols-3 gap-2"}>
                    {bonus.map((card, i) => (
                      <li key={`${card.cardId}-${i}`}>
                        <FlipCard
                          card={{ ...card, userCardId: `${card.cardId}-${i}`, isNew: false, featured: false }}
                          phase={bonusFront ? "front" : "charging"}
                          size={bonus.length === 1 ? "md" : "sm"}
                          reduced={reduced}
                          compactFx
                        />
                      </li>
                    ))}
                  </ul>
                </m.div>
              )}

              {result.team.length > 0 && (
                <m.div {...item(4)} className="flex w-full flex-col items-center gap-2">
                  <span className="text-xs text-washi-paper/70">{t("cardsBack")}</span>
                  <ul className="grid w-full max-w-[16rem] grid-cols-3 gap-2">
                    {result.team.map((card, i) => (
                      <m.li
                        key={card.cardId}
                        initial={reduced ? false : { y: 40, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ type: "spring", stiffness: 240, damping: 20, delay: 0.9 + i * 0.08 }}
                      >
                        <Fuda card={card} series={card.series} size="sm" still />
                      </m.li>
                    ))}
                  </ul>
                </m.div>
              )}

              <m.div {...item(5)} className="flex w-full flex-col gap-2">
                {result.reward.boosters > 0 && result.boosterSlug && (
                  <Link
                    href={`/ouvrir/${result.boosterSlug}?credit=1`}
                    onClick={() => dialog.current?.close()}
                    className="inline-flex min-h-12 items-center justify-center rounded-pill bg-shu-btn px-5 font-bold text-washi-paper shadow-shu"
                  >
                    {t("openBoosters")}
                  </Link>
                )}
                <Button type="button" variant={result.reward.boosters > 0 ? "secondary" : "primary"} onClick={() => dialog.current?.close()}>
                  {t("again")}
                </Button>
              </m.div>
            </div>
          )}
        </div>
      </LazyMotion>
    </dialog>
  );
}
