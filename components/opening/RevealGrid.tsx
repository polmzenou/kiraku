"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import type { OpenedBoosterView } from "@/lib/boosters/view";
import { RARITIES } from "@/lib/catalog/rarity";
import type { SoundName } from "@/lib/sound/synth";
import { Button } from "../ui/Button";
import { revealFx, revealOrder } from "./CardDeck";
import { CHARGE_MS } from "./RarityFx";
import { FlipCard, type FlipPhase } from "./RevealCard";

type Props = {
  boosters: OpenedBoosterView[];
  /** Cartes par rangée (4 pour les sachets, 4 par étage du jūbako). */
  columns: number;
  reduced: boolean;
  play: (name: SoundName, haptic?: number | number[]) => void;
  onMythic: () => void;
  onDone: () => void;
};

/**
 * Plusieurs boosters (×5, ×10) ou un jūbako : toutes les fuda face cachée en grille. « Tout révéler »
 * les retourne en vague diagonale, en marquant une pause sur chaque Épique+ ; un appui en retourne une.
 */
export function RevealGrid({ boosters, columns, reduced, play, onMythic, onDone }: Props) {
  const t = useTranslations("opening");
  // Chaque booster garde sa rangée, ses cartes de la moins rare à la plus rare
  const [rows] = useState(() => boosters.map((b) => revealOrder(b.cards)));
  const cards = rows.flat();
  const [phases, setPhases] = useState<Record<string, FlipPhase>>({});
  const [running, setRunning] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const allFront = cards.every((c) => phases[c.userCardId] === "front");

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const later = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms));

  const reveal = (id: string, delay: number) => {
    const card = cards.find((c) => c.userCardId === id)!;
    const charge = reduced ? 0 : CHARGE_MS[card.rarity];
    later(delay, () => {
      if (card.rarity === "MYTHIC" && !reduced) {
        onMythic();
        play("taiko", [80]);
      }
      setPhases((p) => ({ ...p, [id]: charge > 0 ? "charging" : "front" }));
      if (charge === 0) for (const [s, h] of revealFx(card.rarity)) play(s, h);
    });
    if (charge > 0) {
      later(delay + charge, () => {
        setPhases((p) => ({ ...p, [id]: "front" }));
        for (const [s, h] of revealFx(card.rarity)) play(s, h);
      });
    }
    return charge;
  };

  const revealOne = (id: string) => {
    if (phases[id]) return;
    setPhases((p) => ({ ...p, [id]: "charging" }));
    reveal(id, 0);
  };

  /** Vague diagonale : 70 ms entre deux cartes, plus le temps d'anticipation des cartes rares. */
  const revealAll = () => {
    if (running) return;
    setRunning(true);
    let delay = 0;
    rows.forEach((row, r) =>
      row.forEach((card, c) => {
        if (phases[card.userCardId]) return;
        const rank = RARITIES.indexOf(card.rarity);
        delay = Math.max(delay, (r + c) * 70);
        const charge = reveal(card.userCardId, delay);
        delay += reduced ? 40 : 90 + charge + (rank >= 3 ? 650 : 0);
      }),
    );
  };

  useEffect(() => {
    if (allFront) {
      const id = setTimeout(onDone, reduced ? 200 : 900);
      return () => clearTimeout(id);
    }
  }, [allFront, onDone, reduced]);

  return (
    <div className="flex w-full flex-col items-center gap-5">
      <p className="text-sm text-text-muted">{t("gridHint", { count: cards.length })}</p>
      <ol className="flex w-full max-w-2xl flex-col gap-3">
        {rows.map((row, r) => (
          <li key={boosters[r].id}>
            <ul className="grid gap-2 sm:gap-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
              {row.map((card) => {
                const phase = phases[card.userCardId] ?? "back";
                return (
                  <li key={card.userCardId} className="text-[11px]">
                    <button
                      type="button"
                      onClick={() => revealOne(card.userCardId)}
                      disabled={phase !== "back"}
                      aria-label={phase === "back" ? t("revealCard") : card.name}
                      className="block w-full disabled:cursor-default"
                    >
                      <FlipCard card={card} phase={phase} size="sm" reduced={reduced} compactFx />
                    </button>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ol>
      {!allFront && (
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="shu" onClick={revealAll} disabled={running} className="min-w-40">
            {t("revealAll")}
          </Button>
          <Button onClick={onDone}>{t("toRecap")}</Button>
        </div>
      )}
    </div>
  );
}
