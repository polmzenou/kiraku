"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFxLevel } from "@/components/motion/MotionPreference";
import { ARENA_BY_TIER, type ArenaId } from "@/lib/battle/arenas";
import { botAction } from "@/lib/battle/bot";
import { IMPACT_STYLES, type FxLevel, type ImpactStyle } from "@/lib/battle/choreography";
import { DEFAULT_BATTLE_RULES, engineRules } from "@/lib/battle/config";
import { applyAction, createState } from "@/lib/battle/engine";
import { combatStats } from "@/lib/battle/stats";
import type { BoardTier } from "@/lib/battle/tiers";
import type { Action, BattleSetup, EngineRules, FighterSetup, Keyword, Technique } from "@/lib/battle/types";
import type { PlayerView } from "@/lib/battle/view";
import type { Rarity } from "@/lib/catalog/rarity";
import { seededRng } from "@/lib/rng";
import { useLogLine } from "../BattleLog";
import { Tablets } from "../hud/Hud";
import { StageMenu } from "../hud/StageMenu";
import { Intro } from "../sequences/Intro";
import { Outro } from "../sequences/Outro";
import { BattleStage } from "../stage/BattleStage";
import { useBattleSound } from "../stage/useBattleSound";
import { setBattleSpeed, SPEEDS, useBattleSpeed } from "../stage/useBattleSpeed";
import { useBoardControls } from "../stage/useBoardControls";
import { useDirector, type ArenaHandle } from "../stage/useDirector";
import { PLAYER_AVATAR, SANDBOX_ART } from "./art";
import "./sandbox.css";

// Bac à sable du combat : la vraie scène et le vrai moteur, sans base ni réseau. Trois scénarios : une
// démonstration qui passe par chaque effet (critiques fréquents, passifs choisis), un vrai combat bot
// contre bot, et une partie contre le bot. Les combattants sont des personnages originaux.

type Scenario = "demo" | "real" | "play";
const PAINTED: ArenaId[] = ["dojo", "torii"];
const TIER_OF: Partial<Record<ArenaId, BoardTier>> = Object.fromEntries(Object.entries(ARENA_BY_TIER).map(([tier, arena]) => [arena, tier as BoardTier]));

type Card = { id: keyof typeof SANDBOX_ART; name: string; nameNative: string; rarity: Rarity };
const CAST: Card[] = [
  { id: "AKANE", name: "Akane", nameNative: "茜", rarity: "LEGENDARY" },
  { id: "TSUKIYO", name: "Tsukiyo", nameNative: "月夜", rarity: "EPIC" },
  { id: "KUROGANE", name: "Kurogane", nameNative: "黒鉄", rarity: "MYTHIC" },
  { id: "HAYATE", name: "Hayate", nameNative: "疾風", rarity: "RARE" },
  { id: "GENKAI", name: "Genkai", nameNative: "玄海", rarity: "GOLD" },
  { id: "KOHAKU", name: "Kohaku", nameNative: "琥珀", rarity: "AR" },
];

function fighter(c: Card, n: number, o: { power: number; ki: number; technique: Technique; keywords: Keyword[] }): FighterSetup {
  return {
    cardId: `sandbox-${c.id}-${n}`,
    anilistId: 900_000 + n,
    name: c.name,
    nameNative: c.nameNative,
    imageUrl: SANDBOX_ART[c.id],
    rank: 100 + n * 7,
    rarity: c.rarity,
    power: o.power,
    ki: o.ki,
    ...combatStats(o.power, o.ki, DEFAULT_BATTLE_RULES.stats),
    keywords: o.keywords,
    technique: o.technique,
  };
}

const BASE_RULES: EngineRules = engineRules(DEFAULT_BATTLE_RULES);
const TECHS: Technique[] = ["ISSEN", "KANTSU", "RANBU", "IYASHI", "SHUGO", "KOBU", "FUIN"];
const KEYWORDS: Keyword[] = ["TAUNT", "BARRIER", "FLURRY", "POISON", "RIPOSTE", "LAST_WILL", "REVIVE"];

function setupFor(scenario: Scenario, seed: number): BattleSetup {
  if (scenario === "demo") {
    // Une équipe qui montre tout : 一閃, 癒し, 乱舞 contre 貫通, 鼓舞, 封印, et les sept passifs
    const rules: EngineRules = { ...BASE_RULES, firstTurnActions: 3, orbs: { start: 3, perTurn: 1, max: 5, secondBonus: 0 }, damage: { ...BASE_RULES.damage, critPermille: 300 } };
    return {
      first: 0,
      rules,
      teams: [
        [
          fighter(CAST[0], 1, { power: 88, ki: 52, technique: "ISSEN", keywords: ["FLURRY"] }),
          fighter(CAST[1], 2, { power: 58, ki: 70, technique: "IYASHI", keywords: ["BARRIER"] }),
          fighter(CAST[2], 3, { power: 80, ki: 78, technique: "RANBU", keywords: ["TAUNT", "RIPOSTE"] }),
        ],
        [
          fighter(CAST[3], 4, { power: 74, ki: 48, technique: "KANTSU", keywords: ["POISON"] }),
          fighter(CAST[4], 5, { power: 64, ki: 72, technique: "KOBU", keywords: ["LAST_WILL"] }),
          fighter(CAST[5], 6, { power: 82, ki: 60, technique: "FUIN", keywords: ["REVIVE"] }),
        ],
      ],
    };
  }
  const rng = seededRng(seed);
  const order = [...CAST].sort((a, b) => ((seed * 31 + a.id.length * 7) % 5) - ((seed * 17 + b.id.length * 3) % 5));
  const team = (from: number) =>
    order.slice(from, from + 3).map((c, i) =>
      fighter(c, from + i + seed * 10, {
        power: 45 + rng(56),
        ki: 32 + rng(54),
        technique: TECHS[rng(TECHS.length)],
        keywords: [...new Set(Array.from({ length: rng(3) }, () => KEYWORDS[rng(KEYWORDS.length)]))],
      }),
    );
  return { first: 0, rules: BASE_RULES, teams: [team(0), team(3)] };
}

function Battle({
  scenario,
  seed,
  arena,
  style,
  level,
  manual,
  nextRef,
  onRestart,
}: {
  scenario: Scenario;
  seed: number;
  arena: ArenaId;
  style: ImpactStyle;
  level: FxLevel;
  manual: boolean;
  nextRef: { current: (() => void) | null };
  onRestart: () => void;
}) {
  const t = useTranslations("battle");
  const ts = useTranslations("battle.sandbox");
  const setup = useMemo(() => setupFor(scenario, seed), [scenario, seed]);
  const initial = useMemo(() => createState(setup).state, [setup]);
  const players = useMemo<[PlayerView, PlayerView]>(
    () => [{ username: ts("you"), image: PLAYER_AVATAR, isGuest: false, decor: { frame: "kinpaku", nameColor: null } }, { bot: scenario === "demo" ? "KITSUNE" : "ONI" }],
    [scenario, ts],
  );
  const speed = useBattleSpeed();
  const sound = useBattleSound(arena, true);
  const arenaHandle = useRef<ArenaHandle | null>(null);
  const setArena = useCallback((h: ArenaHandle | null) => void (arenaHandle.current = h), []);
  const director = useDirector(initial, { setup, mySide: 0, level, style, speed, sound: sound.port, arena: arenaHandle });
  const { play } = director;
  const truth = useRef(initial);
  const rng = useRef(seededRng(seed ^ 0xb07));
  const [phase, setPhase] = useState<"intro" | "fight" | "outro">("intro");
  const [turnStart, setTurnStart] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const line = useLogLine(setup, players);

  const apply = useCallback(
    (action: Action) => {
      if (truth.current.finished) return;
      const res = applyAction(setup, seed, truth.current, action);
      if (res.state.active !== truth.current.active || res.state.turn !== truth.current.turn) setTurnStart(Date.now());
      truth.current = res.state;
      play(res.events, res.state);
    },
    [play, seed, setup],
  );
  const botMove = useCallback(() => {
    const s = truth.current;
    if (s.finished) return;
    apply(botAction(setup, s, s.active, rng.current, scenario === "demo" ? 8 : 20));
  }, [apply, scenario, setup]);
  useEffect(() => {
    nextRef.current = phase === "fight" && !director.animating ? botMove : null;
  }, [botMove, director.animating, nextRef, phase]);

  const human = scenario === "play";
  // Hors animation, l'état affiché est celui du moteur
  const humanTurn = human && director.shown.active === 0 && !director.shown.finished;
  useEffect(() => {
    if (phase !== "fight" || director.animating) return;
    if (truth.current.finished) {
      const id = setTimeout(() => setPhase("outro"), 500);
      return () => clearTimeout(id);
    }
    if (humanTurn || (manual && !human)) return;
    const id = setTimeout(botMove, human ? 650 : 380);
    return () => clearTimeout(id);
  }, [botMove, director.animating, human, humanTurn, manual, phase]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const canAct = phase === "fight" && humanTurn && !director.animating;
  const controls = useBoardControls({ setup, shown: director.shown, mySide: 0, canAct, send: apply });

  const last = [...director.feed].reverse().find((f) => line(f.event));
  const hintText = human && controls.hint && controls.hint !== "waitOpponent" ? t(`board.${controls.hint}`) : null;
  const ticker = canAct && hintText ? { text: hintText, tone: "mine" as const } : { text: last ? line(last.event) : t("log.empty"), tone: "hint" as const };
  const tier = TIER_OF[arena] ?? null;
  const shown = director.shown;
  const outcome = shown.winner === null ? "draw" : shown.winner === 0 ? "victory" : "defeat";
  const reason = shown.endReason ? t(`result.reason.${shown.endReason === "KO" && shown.winner !== 0 ? "KO_LOSS" : shown.endReason}`) : null;

  return (
    <BattleStage
      setup={setup}
      director={director}
      mySide={0}
      players={players}
      tier={tier}
      tiers={[tier, tier]}
      arena={arena}
      level={level}
      arenaRef={setArena}
      mine={human ? { selected: controls.selected, ready: controls.selected === null && canAct ? controls.ready : undefined, targets: controls.allyTargets, onPress: controls.pressMine } : undefined}
      theirs={human ? { targets: controls.enemyTargets, onPress: controls.pressTheirs } : undefined}
      ticker={ticker}
      timer={phase === "fight" && !shown.finished ? { secondsLeft: Math.max(0, 30 - (now - turnStart) / 1_000), total: 30 } : null}
      tablets={
        human ? (
          <Tablets
            mode={controls.mode}
            attack={{ enabled: canAct && controls.selected !== null, onPress: () => controls.setMode("ATTACK") }}
            technique={{ technique: controls.technique, cost: controls.cost, enabled: controls.techniqueEnabled, onPress: controls.pressTechnique }}
            end={{ enabled: canAct, pulse: controls.ready.size === 0, onPress: controls.endTurn }}
          />
        ) : null
      }
      menu={<StageMenu sound={{ enabled: sound.enabled, set: sound.setEnabled }} music={{ enabled: sound.music, set: sound.setMusic }} speed={speed} />}
      overlay={
        phase === "intro" ? (
          <Intro
            arena={arena}
            players={players}
            mySide={0}
            tiers={[tier, tier]}
            first={setup.first}
            level={level}
            deal={() => director.deal([1, 0].flatMap((side) => [0, 1, 2].map((index) => ({ side: side as 0 | 1, index }))))}
            finishDeal={director.finishDeal}
            onDone={() => {
              setPhase("fight");
              setTurnStart(Date.now());
            }}
            sound={sound.port}
          />
        ) : phase === "outro" ? (
          <Outro outcome={outcome} reason={reason} level={level}>
            <div className="sandbox-result">
              <p>{outcome === "victory" ? t("result.zeni", { amount: 25 }) : t("result.noZeni")}</p>
              <button type="button" className="tablet" onClick={onRestart}>
                <span aria-hidden="true" className="tablet-kanji">
                  再
                </span>
                <span className="tablet-label">{ts("again")}</span>
              </button>
            </div>
          </Outro>
        ) : null
      }
    />
  );
}

export type SandboxInitial = { scenario?: Scenario; arena?: ArenaId; style?: ImpactStyle; level?: FxLevel | "auto"; frame?: "phone" | "wide" };

export function BattleSandbox({ initial = {} }: { initial?: SandboxInitial }) {
  const t = useTranslations("battle.sandbox");
  const motion = useFxLevel();
  const [scenario, setScenario] = useState<Scenario>(initial.scenario ?? "demo");
  const [arena, setArena] = useState<ArenaId>(initial.arena && PAINTED.includes(initial.arena) ? initial.arena : "torii");
  const [style, setStyle] = useState<ImpactStyle>(initial.style ?? "sumi");
  const [level, setLevel] = useState<FxLevel | "auto">(initial.level ?? "auto");
  const [frame, setFrame] = useState<"phone" | "wide">(initial.frame ?? "phone");
  const [manual, setManual] = useState(false);
  const [seed, setSeed] = useState(7);
  const [open, setOpen] = useState(false);
  const speed = useBattleSpeed();
  const next = useRef<(() => void) | null>(null);
  const restart = () => setSeed((s) => s + 1);

  const choice = <T extends string | number>(label: string, value: T, options: readonly T[], set: (v: T) => void, name: (v: T) => string, disabled?: (v: T) => boolean) => (
    <fieldset className="sandbox-choice">
      <legend>{label}</legend>
      {options.map((o) => (
        <button key={o} type="button" aria-pressed={value === o} disabled={disabled?.(o)} onClick={() => set(o)}>
          {name(o)}
        </button>
      ))}
    </fieldset>
  );

  return (
    <div className="sandbox" data-frame={frame}>
      <div className="sandbox-frame">
        <Battle
          key={`${scenario}-${seed}-${arena}`}
          scenario={scenario}
          seed={seed}
          arena={arena}
          style={style}
          level={level === "auto" ? motion : level}
          manual={manual}
          nextRef={next}
          onRestart={restart}
        />
      </div>
      <button type="button" className="sandbox-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        {t("settings")}
      </button>
      <aside className="sandbox-panel" data-open={open || undefined}>
        <h1>{t("title")}</h1>
        <p className="sandbox-note">{t("note")}</p>
        {choice(t("scenario"), scenario, ["demo", "real", "play"] as const, setScenario, (v) => t(`scenarios.${v}`))}
        {choice(t("arena"), arena, ["dojo", "torii", "chikurin", "suiu", "tenshu", "himatsuri", "takamagahara"] as const, setArena, (v) => t(`arenas.${v}`), (v) => !PAINTED.includes(v))}
        {choice(t("style"), style, IMPACT_STYLES, setStyle, (v) => t(`styles.${v}`))}
        {choice(t("speed"), speed, SPEEDS, setBattleSpeed, (v) => `×${v}`)}
        {choice(t("level"), level, ["auto", "full", "lite", "reduced"] as const, setLevel, (v) => t(`levels.${v}`))}
        {choice(t("frame"), frame, ["phone", "wide"] as const, setFrame, (v) => t(`frames.${v}`))}
        {scenario !== "play" && choice(t("pace"), manual ? "step" : "auto", ["auto", "step"] as const, (v) => setManual(v === "step"), (v) => t(`paces.${v}`))}
        <div className="sandbox-actions">
          {manual && scenario !== "play" && (
            <button type="button" onClick={() => next.current?.()}>
              {t("next")}
            </button>
          )}
          <button type="button" onClick={restart}>
            {t("restart")}
          </button>
        </div>
      </aside>
    </div>
  );
}
