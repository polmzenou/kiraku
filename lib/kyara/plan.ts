import { KYARA_BASE_RARITY, type KyaraCode } from "./codes";

// Ce que rapporte une collection Kyara lue par l'équipe. Une entrée par personnage (les copies en plus chez Kyara
// ne rapportent rien), dans cet ordre :
//   1. MISSING     personnage absent de notre catalogue : Zeni selon la rareté Kyara ;
//   2. UNPUBLISHED carte en brouillon ou archivée : Zeni selon la rareté Kyara ;
//   3. ABOVE       plus rare chez nous que chez Kyara (plafond Kyara) : Zeni selon la rareté Kyara ;
//   4. OWNED       déjà possédée par le joueur : Zeni à la valeur de recyclage de notre rareté ;
//   5. CARD        sinon, notre carte de base.
// Le plafond passe avant « déjà possédée » : une Commune Kyara ne rapporte jamais le prix d'une Mythique.
// Fonction pure et déterministe : recalculée à l'aperçu et sous verrou au versement.

export type KyaraEntry = { anilistId: number; qty: number; code: KyaraCode };

/** Carte de base du catalogue pour un personnage (anilistId). */
export type KyaraCatalogCard = { cardId: string; rarity: string; published: boolean };

export const OUTCOME_KINDS = ["CARD", "OWNED", "ABOVE", "MISSING", "UNPUBLISHED"] as const;
export type OutcomeKind = (typeof OUTCOME_KINDS)[number];

export type KyaraOutcome = {
  anilistId: number;
  code: KyaraCode;
  kind: OutcomeKind;
  cardId: string | null;
  rarity: string | null;
  zeni: number;
};

export type KyaraPlanInput = {
  entries: readonly KyaraEntry[];
  catalog: ReadonlyMap<number, KyaraCatalogCard>;
  /** Cartes que le joueur possède déjà, quel que soit le statut de l'exemplaire. */
  owned: ReadonlySet<string>;
  /** RarityDefinition.sortOrder par clé de rareté. */
  sortOrder: ReadonlyMap<string, number>;
  zeniByCode: Readonly<Record<KyaraCode, number>>;
  recycleValues: Readonly<Record<string, number>>;
  zeniCap: number;
};

export type KyaraPlan = {
  outcomes: KyaraOutcome[];
  /** Cartes à verser (une par personnage), dans l'ordre des personnages. */
  grant: { cardId: string; rarity: string }[];
  zeniRaw: number;
  zeni: number;
  capped: boolean;
  /** Copies en plus chez Kyara, ignorées. */
  extraCopies: number;
  byKind: Record<OutcomeKind, { count: number; zeni: number }>;
};

/** Une entrée par personnage, triée : quantités additionnées, première rareté gardée. */
export function mergeEntries(entries: readonly KyaraEntry[]): KyaraEntry[] {
  const merged = new Map<number, KyaraEntry>();
  for (const e of entries) {
    const known = merged.get(e.anilistId);
    merged.set(e.anilistId, known ? { ...known, qty: known.qty + e.qty } : { ...e });
  }
  return [...merged.values()].sort((a, b) => a.anilistId - b.anilistId);
}

function outcomeFor(e: KyaraEntry, input: KyaraPlanInput): Omit<KyaraOutcome, "anilistId" | "code"> {
  const theirs = input.zeniByCode[e.code] ?? 0;
  const card = input.catalog.get(e.anilistId);
  if (!card) return { kind: "MISSING", cardId: null, rarity: null, zeni: theirs };
  if (!card.published) return { kind: "UNPUBLISHED", cardId: card.cardId, rarity: card.rarity, zeni: theirs };
  const ours = input.sortOrder.get(card.rarity);
  const cap = input.sortOrder.get(KYARA_BASE_RARITY[e.code]);
  if (ours === undefined || cap === undefined || ours > cap) return { kind: "ABOVE", cardId: card.cardId, rarity: card.rarity, zeni: theirs };
  if (input.owned.has(card.cardId)) return { kind: "OWNED", cardId: card.cardId, rarity: card.rarity, zeni: input.recycleValues[card.rarity] ?? 0 };
  return { kind: "CARD", cardId: card.cardId, rarity: card.rarity, zeni: 0 };
}

export function planKyaraImport(input: KyaraPlanInput): KyaraPlan {
  const byKind = Object.fromEntries(OUTCOME_KINDS.map((k) => [k, { count: 0, zeni: 0 }])) as KyaraPlan["byKind"];
  const outcomes: KyaraOutcome[] = [];
  const grant: KyaraPlan["grant"] = [];
  let zeniRaw = 0;
  let extraCopies = 0;
  for (const e of mergeEntries(input.entries)) {
    const o = { anilistId: e.anilistId, code: e.code, ...outcomeFor(e, input) };
    outcomes.push(o);
    byKind[o.kind].count += 1;
    byKind[o.kind].zeni += o.zeni;
    zeniRaw += o.zeni;
    extraCopies += Math.max(0, e.qty - 1);
    if (o.kind === "CARD" && o.cardId !== null && o.rarity !== null) grant.push({ cardId: o.cardId, rarity: o.rarity });
  }
  const zeni = Math.min(zeniRaw, Math.max(0, input.zeniCap));
  return { outcomes, grant, zeniRaw, zeni, capped: zeni < zeniRaw, extraCopies, byKind };
}
