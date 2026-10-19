"use client";

import { useTranslations } from "next-intl";
import { Fuda } from "@/components/fuda/Fuda";
import type { FighterSetup, FighterState } from "@/lib/battle/types";

/** Effet posé sur une carte : impact, chiffre de dégâts, soin, poison ou blocage. */
export type Fx = { id: number; kind: "impact" | "damage" | "crit" | "heal" | "poison" | "block"; amount: number; crit?: boolean };

type Props = {
  card: FighterSetup;
  state: FighterState;
  selected?: boolean;
  targetable?: boolean;
  /** Mon tour, carte qui a encore une action. */
  ready?: boolean;
  fx: readonly Fx[];
  onPress?: () => void;
  label: string;
  /** Enveloppe animée par le lecteur (charge, secousse, chute). */
  cardRef?: (el: HTMLElement | null) => void;
};

/** Éclaboussure d'encre (impact), dessinée en SVG : rien à charger. */
function InkSplash({ crit }: { crit?: boolean }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="battle-impact absolute inset-[-25%] size-[150%]">
      <g fill={crit ? "#D9B556" : "#E0533F"} opacity={0.9}>
        <path d="M50 18 L56 40 L80 26 L62 46 L88 52 L62 58 L76 80 L54 63 L48 88 L43 63 L20 78 L36 57 L10 50 L36 44 L22 22 L44 38 Z" />
      </g>
      <circle cx="50" cy="51" r="9" fill="#F1E9DA" opacity={0.85} />
    </svg>
  );
}

/**
 * Fuda en combat, lisible à distance : gemme ATQ (vermillon) et gemme PV (encre) aux coins du bas
 * comme sur une table de jeu de cartes, barre de PV, passifs et états traduits. Les chiffres de
 * combat sont gros et détourés ; les animations ne touchent que transform et opacity.
 */
export function BattleFuda({ card, state, selected, targetable, ready, fx, onPress, label, cardRef }: Props) {
  const t = useTranslations("battle.board");
  const keywords = useTranslations("battle.keywords");
  const dead = state.hp <= 0;
  const hpPct = Math.max(0, Math.min(100, (state.hp / state.maxHp) * 100));
  const buffed = state.buffTurns > 0 && state.buffPct > 0;
  const atk = buffed ? Math.floor((card.atk * (100 + state.buffPct)) / 100) : card.atk;
  const hurt = state.hp < state.maxHp;
  const interactive = Boolean(onPress) && !dead;

  return (
    <div ref={cardRef} className="relative will-change-transform">
      <button
        type="button"
        onClick={interactive ? onPress : undefined}
        aria-disabled={!interactive}
        aria-pressed={selected}
        aria-label={label}
        className={`group relative block w-full rounded-[7px] text-left transition-transform duration-200 ease-out motion-reduce:transition-none ${
          selected ? "-translate-y-2 scale-[1.04]" : interactive && ready ? "hover:-translate-y-1" : ""
        } ${interactive ? "cursor-pointer" : "cursor-default"}`}
      >
        {/* Halo : prête (or doux), sélectionnée (or vif), cible possible (vermillon qui pulse) */}
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute -inset-1.5 rounded-[10px] transition-opacity duration-200 ${
            selected
              ? "opacity-100 shadow-[0_0_0_3px_#D9B556,0_0_22px_6px_rgba(217,181,86,0.55)]"
              : targetable
                ? "animate-pulse opacity-100 shadow-[0_0_0_3px_#E0533F,0_0_20px_6px_rgba(224,83,63,0.5)]"
                : ready
                  ? "opacity-100 shadow-[0_0_0_2px_rgba(217,181,86,0.7),0_0_14px_3px_rgba(217,181,86,0.3)]"
                  : "opacity-0"
          }`}
        />

        <div className={`transition-opacity duration-500 motion-reduce:transition-none ${dead ? "opacity-35" : "opacity-100"}`}>
          <Fuda card={card} size="sm" variant="battle" tilt={false} sizes="(min-width: 1024px) 190px, (min-width: 768px) 150px, 30vw" />
        </div>

        {/* Barrière : halo indigo */}
        {state.barrier && !dead && (
          <span aria-hidden="true" className="pointer-events-none absolute -inset-1 rounded-[9px] border-[3px] border-ai shadow-[0_0_18px_4px_rgba(127,163,209,0.6),inset_0_0_14px_rgba(127,163,209,0.5)]" />
        )}

        {/* Passifs et états sur une seule colonne pour éviter les chevauchements. */}
        <span aria-hidden="true" className="absolute top-7 right-0.5 left-0.5 flex flex-col items-end gap-0.5 text-[9px] font-bold leading-tight md:text-[11px]">
          {card.keywords.map((k) => (
            <span key={k} className="max-w-full rounded-[3px] border border-washi-paper/30 bg-sumi/90 px-1 text-right text-washi-paper">
              {keywords(`${k}.name`)}
            </span>
          ))}
          {state.sealed && !dead && (
            <span className="max-w-full rounded-[3px] bg-sumi/90 px-1 text-shu">
              {t("sealed")}
            </span>
          )}
          {state.poisonTurns > 0 && !dead && (
            <span className="max-w-full rounded-[3px] bg-[#3f5a26] px-1 text-washi-paper">
              {t("poisoned")}
            </span>
          )}
          {buffed && !dead && <span className="rounded-[3px] bg-kin px-1 text-sumi">+{state.buffPct}%</span>}
        </span>

        {/* Gemmes ATQ et PV, débordant du cadre comme sur une table */}
        <span aria-hidden="true" className="absolute -bottom-2 -left-2 md:-bottom-3 md:-left-3">
          <span
            className={`flex size-9 items-center justify-center rounded-full border-2 border-[#3b1410] bg-[radial-gradient(circle_at_35%_30%,#ff7a5f,#C8372D_55%,#7d1a14)] text-base font-extrabold tabular-nums text-washi-paper shadow-[0_3px_0_rgba(0,0,0,0.6)] [-webkit-text-stroke:3px_#3b1410] [paint-order:stroke_fill] md:size-12 md:text-xl ${
              buffed ? "ring-2 ring-kin" : ""
            }`}
          >
            {atk}
          </span>
        </span>
        <span aria-hidden="true" className="absolute -right-2 -bottom-2 md:-right-3 md:-bottom-3">
          <span
            className={`flex h-9 min-w-9 items-center justify-center rounded-full border-2 border-[#0c0a08] bg-[radial-gradient(circle_at_35%_30%,#4a4038,#1f1b17_60%,#0c0a08)] px-1 text-base font-extrabold tabular-nums shadow-[0_3px_0_rgba(0,0,0,0.6)] [-webkit-text-stroke:3px_#0c0a08] [paint-order:stroke_fill] md:h-12 md:min-w-12 md:text-xl ${
              hurt ? "text-[#ff8a78]" : "text-washi-paper"
            }`}
          >
            {state.hp}
          </span>
        </span>

        {/* Barre de PV, sous la carte entre les deux gemmes (le nom reste lisible) */}
        <span aria-hidden="true" className="absolute inset-x-7 -bottom-2.5 h-1.5 overflow-hidden rounded-full border border-black/60 bg-sumi md:inset-x-10 md:-bottom-3 md:h-2">
          <span
            className={`block h-full origin-left transition-transform duration-500 ease-out motion-reduce:transition-none ${
              hpPct > 50 ? "bg-[#6fa04f]" : hpPct > 25 ? "bg-kin" : "bg-shu"
            }`}
            style={{ transform: `scaleX(${hpPct / 100})` }}
          />
        </span>

        {/* Carte consumée : cendre qui monte, en opacité seulement */}
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 rounded-[7px] bg-gradient-to-t from-sumi via-sumi/70 to-transparent transition-opacity duration-700 motion-reduce:transition-none ${
            dead ? "opacity-85" : "opacity-0"
          }`}
        />
        {dead && (
          <span aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center font-title text-3xl font-extrabold text-shu/80 md:text-5xl">
            {t("ko")}
          </span>
        )}
      </button>

      {/* Impacts et chiffres, au-dessus de la carte */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
        {fx.map((f) =>
          f.kind === "impact" ? (
            <InkSplash key={f.id} crit={f.crit} />
          ) : (
            <span
              key={f.id}
              data-crit={f.kind === "crit"}
              className={`battle-number absolute flex flex-col items-center font-title font-extrabold leading-none tabular-nums ${
                f.kind === "heal"
                  ? "text-4xl text-[#9be07a] md:text-5xl"
                  : f.kind === "block"
                    ? "text-xl text-ai md:text-2xl"
                    : f.kind === "poison"
                      ? "text-3xl text-[#b6dc5e] md:text-4xl"
                      : f.kind === "crit"
                        ? "text-5xl text-kin md:text-7xl"
                        : "text-4xl text-[#ff5a45] md:text-6xl"
              }`}
            >
              {f.kind === "crit" && (
                <span className="mb-0.5 text-sm text-washi-paper md:text-xl">
                  {t("crit")}
                </span>
              )}
              {f.kind === "heal" ? `+${f.amount}` : f.kind === "block" ? t("block") : `−${f.amount}`}
            </span>
          ),
        )}
      </span>
    </div>
  );
}
