"use client";

import { useTranslations } from "next-intl";
import { Fuda } from "@/components/fuda/Fuda";
import { KEYWORD_KANJI, type FighterSetup, type FighterState } from "@/lib/battle/types";

/** Chiffre flottant au-dessus d'une carte (dégâts, soin, blocage). */
export type Fx = { id: number; kind: "damage" | "crit" | "heal" | "poison" | "block"; amount: number };

type Props = {
  card: FighterSetup;
  state: FighterState;
  /** Carte qui fonce sur sa cible (vers le haut pour le bas du plateau, et inversement). */
  lunge: "up" | "down" | null;
  selected?: boolean;
  targetable?: boolean;
  /** Mon tour, carte qui a encore une action. */
  ready?: boolean;
  fx: readonly Fx[];
  onPress?: () => void;
  label: string;
};

/**
 * Fuda en combat : la carte en petit format, barre de PV, 力 et passifs. Les animations ne
 * touchent que transform et opacity (élan vers la cible, chiffres qui montent, carte consumée).
 */
export function BattleFuda({ card, state, lunge, selected, targetable, ready, fx, onPress, label }: Props) {
  const t = useTranslations("battle.board");
  const dead = state.hp <= 0;
  const hpPct = Math.max(0, Math.min(100, (state.hp / state.maxHp) * 100));
  const buffed = state.buffTurns > 0 && state.buffPct > 0;
  const atk = buffed ? Math.floor((card.atk * (100 + state.buffPct)) / 100) : card.atk;
  const interactive = Boolean(onPress) && !dead;

  return (
    <button
      type="button"
      onClick={interactive ? onPress : undefined}
      aria-disabled={!interactive}
      aria-pressed={selected}
      aria-label={label}
      className={`relative block w-full rounded-[6px] text-left transition-transform duration-300 ease-out motion-reduce:transition-none ${
        lunge === "up" ? "-translate-y-6 scale-105" : lunge === "down" ? "translate-y-6 scale-105" : ""
      } ${selected ? "-translate-y-1" : ""} ${interactive ? "cursor-pointer" : "cursor-default"}`}
    >
      <div className={`transition-opacity duration-500 motion-reduce:transition-none ${dead ? "opacity-30" : "opacity-100"}`}>
        <Fuda card={card} size="sm" tilt={false} sizes="(min-width: 768px) 160px, 30vw" />
      </div>

      {/* Anneau de sélection / cible possible */}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute -inset-1 rounded-[8px] border-2 transition-opacity duration-200 ${
          selected ? "border-kin opacity-100" : targetable ? "animate-pulse border-shu opacity-100" : ready ? "border-ai/70 opacity-100" : "opacity-0"
        }`}
      />

      {/* Barrière 結界 : halo bleu */}
      {state.barrier && !dead && (
        <span aria-hidden="true" className="pointer-events-none absolute -inset-0.5 rounded-[7px] border-2 border-ai shadow-[0_0_12px_var(--color-ai)]" />
      )}

      {/* Passifs */}
      {card.keywords.length > 0 && (
        <span aria-hidden="true" className="absolute top-6 right-0.5 flex flex-col items-end gap-0.5">
          {card.keywords.map((k) => (
            <span key={k} lang="ja" className="rounded-sm bg-sumi/85 px-0.5 font-seal text-[10px] leading-tight text-washi-paper">
              {KEYWORD_KANJI[k]}
            </span>
          ))}
        </span>
      )}

      {/* États */}
      <span aria-hidden="true" className="absolute top-6 left-0.5 flex flex-col gap-0.5 text-[10px] font-bold leading-tight">
        {state.sealed && !dead && <span className="rounded-sm bg-sumi/85 px-0.5 font-seal text-shu" lang="ja">封</span>}
        {state.poisonTurns > 0 && !dead && <span className="rounded-sm bg-[#4d6b2f] px-0.5 font-seal text-washi-paper" lang="ja">毒</span>}
        {buffed && !dead && <span className="rounded-sm bg-kin px-0.5 text-sumi">+{state.buffPct}%</span>}
      </span>

      {/* 力 et PV en bas, façon jeu de cartes */}
      <span aria-hidden="true" className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 px-0.5 pb-0.5">
        <span className="flex items-end justify-between">
          <span className={`flex size-7 items-center justify-center rounded-full border-2 border-sumi bg-shu-btn text-xs font-bold tabular-nums text-washi-paper ${buffed ? "ring-2 ring-kin" : ""}`}>
            {atk}
          </span>
          <span className="rounded-sm bg-sumi/85 px-1 text-[11px] font-bold tabular-nums text-washi-paper">
            {t("hp", { hp: state.hp, max: state.maxHp })}
          </span>
        </span>
        <span className="h-1.5 overflow-hidden rounded-full bg-sumi/70">
          <span
            className={`block h-full origin-left transition-transform duration-500 ease-out motion-reduce:transition-none ${
              hpPct > 50 ? "bg-[#5c7f45]" : hpPct > 25 ? "bg-kin" : "bg-shu"
            }`}
            style={{ transform: `scaleX(${hpPct / 100})` }}
          />
        </span>
      </span>

      {/* Carte consumée : cendre qui monte, en opacité seulement */}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 rounded-[6px] bg-gradient-to-t from-sumi via-sumi/60 to-transparent transition-opacity duration-700 motion-reduce:transition-none ${
          dead ? "opacity-80" : "opacity-0"
        }`}
      />

      {/* Chiffres flottants */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-1/3 flex justify-center">
        {fx.map((f) => (
          <span
            key={f.id}
            className={`battle-float absolute font-title font-extrabold tabular-nums drop-shadow-[0_2px_0_rgba(0,0,0,0.6)] ${
              f.kind === "heal"
                ? "text-xl text-[#8fc06a]"
                : f.kind === "block"
                  ? "text-sm text-ai"
                  : f.kind === "poison"
                    ? "text-lg text-[#9bc25a]"
                    : f.kind === "crit"
                      ? "text-3xl text-kin"
                      : "text-2xl text-shu"
            }`}
          >
            {f.kind === "heal" ? `+${f.amount}` : f.kind === "block" ? t("block") : `−${f.amount}`}
          </span>
        ))}
      </span>
    </button>
  );
}
