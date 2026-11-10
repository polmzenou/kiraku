import type { Rarity } from "@/lib/catalog/rarity";

// Combat 1v1 en direct (étape 9) : types partagés par le moteur, le serveur et le plateau.
// Tout l'état est public (pas de main ni de pioche) : on peut le diffuser tel quel.

export const TEAM_SIZE = 3;

export type Side = 0 | 1;

/**
 * Capacités d'origine : le tirage historique de chaque carte en dépend (lib/battle/stats.ts). Ne jamais les
 * réordonner ni y ajouter quoi que ce soit, sinon toutes les cartes changent. Les ajouts vont dans NEW_*.
 */
export const LEGACY_KEYWORDS = ["TAUNT", "BARRIER", "FLURRY", "POISON", "RIPOSTE", "LAST_WILL", "REVIVE"] as const;
export const LEGACY_TECHNIQUES = ["ISSEN", "KANTSU", "RANBU", "IYASHI", "SHUGO", "KOBU", "FUIN"] as const;
/** Nouveautés : chaque emplacement a battle.newAbilityPct % de chances d'en recevoir une. */
export const NEW_KEYWORDS = ["LIFESTEAL", "RAGE", "ARMOR", "EXECUTE", "CHANNEL"] as const;
export const NEW_TECHNIQUES = ["KONSHIN", "RENGEKI", "JIU", "DOKUGIRI", "MEISO"] as const;

/** Passifs, attribués selon la rareté (battle.keywordsByRarity). */
export const KEYWORDS = [...LEGACY_KEYWORDS, ...NEW_KEYWORDS] as const;
export type Keyword = (typeof KEYWORDS)[number];

/** Une technique par carte, payée en orbes. */
export const TECHNIQUES = [...LEGACY_TECHNIQUES, ...NEW_TECHNIQUES] as const;
export type Technique = (typeof TECHNIQUES)[number];

/** Ce que vise une technique : un ennemi, un allié (soi compris) ou personne (effet de zone). */
export const TECHNIQUE_TARGET: Record<Technique, "ENEMY" | "ALLY" | "NONE"> = {
  ISSEN: "ENEMY",
  KANTSU: "ENEMY",
  RANBU: "NONE",
  IYASHI: "ALLY",
  SHUGO: "ALLY",
  KOBU: "NONE",
  FUIN: "ENEMY",
  KONSHIN: "ENEMY",
  RENGEKI: "ENEMY",
  JIU: "NONE",
  DOKUGIRI: "NONE",
  MEISO: "NONE",
};

/**
 * Ultis (奥義) d'origine, une par personnage des raretés cochées (battle.ultimateRarities). Le tirage de
 * chaque carte en dépend (lib/battle/stats.ts) : ne jamais les réordonner ni y ajouter quoi que ce soit.
 * Des ultis ajoutés plus tard iront dans une liste à part, tirée à part, comme NEW_TECHNIQUES.
 */
export const LEGACY_ULTIMATES = ["TENCHU", "HYAKKA", "KISHI", "FUDO", "TOKIDOME"] as const;
export const ULTIMATES = [...LEGACY_ULTIMATES] as const;
export type Ultimate = (typeof ULTIMATES)[number];

/** Ce que vise un ulti : un ennemi (Provocation respectée), un allié à terre, ou personne (effet de zone). */
export const ULTIMATE_TARGET: Record<Ultimate, "ENEMY" | "DEAD_ALLY" | "NONE"> = {
  TENCHU: "ENEMY",
  HYAKKA: "NONE",
  KISHI: "DEAD_ALLY",
  FUDO: "NONE",
  TOKIDOME: "NONE",
};

/** Jauge pleine : l'ulti se lance à 100 %. */
export const ULTIMATE_FULL = 100;

export const END_REASONS = ["KO", "FORFEIT", "TIMEOUT", "TURN_LIMIT"] as const;
export type EndReason = (typeof END_REASONS)[number];

/** Réglages figés au lancement de la partie (copiés de GameSetting dans le setup). */
export type EngineRules = {
  damage: { critPermille: number; critPct: number; varianceMinPct: number; varianceMaxPct: number };
  orbs: { start: number; perTurn: number; max: number; secondBonus: number };
  /** Actions permises au premier joueur pendant le tout premier tour (compense l'avantage de commencer). */
  firstTurnActions: number;
  maxTurns: number;
  maxMissedTurns: number;
  keywords: {
    poisonPct: number;
    poisonTurns: number;
    ripostePct: number;
    lastWillHealPct: number;
    revivePct: number;
    // Passifs récents : absents du setup des parties plus anciennes, dont aucune carte ne les porte
    lifestealPct: number;
    ragePct: number;
    rageThresholdPct: number;
    armorPct: number;
    executePct: number;
    executeThresholdPct: number;
    channelOrbs: number;
  };
  techniques: Record<Technique, { cost: number; value: number }>;
  /** Bonus d'ATQ (%) d'une équipe du même univers ; absent des parties lancées avant la synergie. */
  synergyAtkPct?: number;
  /**
   * Ultis : charge de la jauge (en points sur 100) et valeur de chacun. Absent des parties lancées avant,
   * dont aucune carte n'a d'ulti.
   */
  ultimate?: {
    /** Points gagnés à chaque action de la carte, et pour la perte de 100 % de ses PV max (au prorata). */
    charge: { perAction: number; damagePct: number };
    values: Record<Ultimate, number>;
  };
};

/** Univers d'une carte : `key` = id de l'univers, ou de la série quand elle n'est rangée nulle part. */
export type UniverseRef = { key: string; name: string };

/** Synergie d'un camp, figée au lancement : changer un regroupement ne touche ni les parties en cours ni les replays. */
export type SideSynergy = { key: string; name: string; atkPct: number };

/** Une carte telle qu'elle entre en combat : stats, passifs et technique figés. */
export type FighterSetup = {
  cardId: string;
  anilistId: number;
  name: string;
  nameNative: string | null;
  imageUrl: string;
  appearance?: unknown;
  rank: number | null;
  rarity: Rarity;
  power: number;
  ki: number;
  atk: number;
  def: number;
  hp: number;
  spd: number;
  keywords: Keyword[];
  technique: Technique;
  /** Ulti du personnage, selon sa rareté ; absent sinon (et sur les parties lancées avant les ultis). */
  ultimate?: Ultimate;
  universe?: UniverseRef;
  /** Carte spoil (illustration floutée en mode spoiler) ; absent sinon, et sur les parties lancées avant ce mode. */
  spoiler?: boolean;
};

export type BattleSetup = {
  teams: [FighterSetup[], FighterSetup[]];
  /** Camp qui joue le premier tour. */
  first: Side;
  rules: EngineRules;
  /** Absent quand aucun camp n'a de synergie (et sur les parties lancées avant). */
  synergy?: [SideSynergy | null, SideSynergy | null];
};

export type FighterState = {
  hp: number;
  maxHp: number;
  barrier: boolean;
  /** 復活 déjà consommé. */
  revived: boolean;
  /** Tours de poison restants et dégâts par tour. */
  poisonTurns: number;
  poisonDmg: number;
  /** Bonus d'ATK de 鼓舞 (en %) et tours restants. */
  buffPct: number;
  buffTurns: number;
  /** 封印 : ne pourra pas agir à son prochain tour. */
  sealed: boolean;
  actionsLeft: number;
  /** Jauge d'ulti, de 0 à ULTIMATE_FULL. Présente seulement sur une carte qui a un ulti. */
  charge?: number;
  /** Ulti déjà lancé (une fois par partie). Présent seulement sur une carte qui a un ulti. */
  ultUsed?: boolean;
};

export type BattleState = {
  /** Nombre d'actions appliquées (sert aussi à dériver le hasard de la suivante). */
  seq: number;
  /** Tour global, 1 au départ ; chaque camp joue un tour sur deux. */
  turn: number;
  active: Side;
  orbs: number;
  /** Actions encore permises ce tour, tous combattants confondus (null = pas de limite). */
  budget: number | null;
  /** Tours expirés d'affilée, par camp. */
  missed: [number, number];
  fighters: [FighterState[], FighterState[]];
  finished: boolean;
  /** null : match nul (ou partie en cours). */
  winner: Side | null;
  endReason: EndReason | null;
  /** Synergie encore active, par camp. Absent quand le setup n'en a pas. */
  synergy?: [boolean, boolean];
};

export type Action =
  | { type: "ATTACK"; side: Side; actor: number; target: number }
  | { type: "TECHNIQUE"; side: Side; actor: number; target?: number }
  | { type: "ULTIMATE"; side: Side; actor: number; target?: number }
  | { type: "END_TURN"; side: Side }
  | { type: "TIMEOUT"; side: Side }
  | { type: "FORFEIT"; side: Side };

/** Ce que le plateau anime, dans l'ordre. `side`/`index` désignent la carte concernée. */
export type BattleEvent =
  | { t: "turn"; side: Side; turn: number; orbs: number }
  | { t: "attack"; side: Side; actor: number; target: number | null; technique: Technique | null }
  /** Lancement d'un ulti par la carte `actor` ; ses effets suivent. */
  | { t: "ultimate"; side: Side; actor: number; target: number | null; ultimate: Ultimate }
  | { t: "damage"; side: Side; index: number; amount: number; crit: boolean; hp: number }
  /** `pierced` : la Barrière vole en éclats sans arrêter le coup (Châtiment céleste), qui suit aussitôt. */
  | { t: "block"; side: Side; index: number; pierced?: true }
  | { t: "heal"; side: Side; index: number; amount: number; hp: number }
  /** Vampirisme de la carte `index` : suivi du `heal` correspondant. */
  | { t: "lifesteal"; side: Side; index: number }
  /** Orbes du tour en cours après un gain (Concentration, Méditation). */
  | { t: "orbs"; side: Side; orbs: number }
  | { t: "poisoned"; side: Side; index: number }
  | { t: "poison"; side: Side; index: number; amount: number; hp: number }
  | { t: "riposte"; side: Side; index: number }
  | { t: "ko"; side: Side; index: number }
  | { t: "synergy_break"; side: Side }
  | { t: "revive"; side: Side; index: number; hp: number }
  /** Relevée par un ulti (Résurrection) : ne consomme pas sa Renaissance, contrairement à `revive`. */
  | { t: "raise"; side: Side; index: number; hp: number }
  | { t: "barrier"; side: Side; index: number }
  | { t: "buff"; side: Side; pct: number }
  | { t: "seal"; side: Side; index: number }
  | { t: "timeout"; side: Side }
  | { t: "forfeit"; side: Side }
  | { t: "end"; winner: Side | null; reason: EndReason };

export class IllegalAction extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "IllegalAction";
  }
}
