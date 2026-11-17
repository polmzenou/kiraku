import { USERNAME_REGEX } from "@/lib/username";

// Paramètres de l'URL du salon : ?onglet=, ?palier= (clé de la rareté de base du palier), ?pour= (pseudo d'une
// table réservée) et ?revanche= (table jouée dont l'adversaire est réservé). Le serveur revérifie tout.

export const SALON_TABS = ["tables", "mes-tables", "historique"] as const;
export type SalonTab = (typeof SALON_TABS)[number];

export type SalonParams = {
  tab: SalonTab;
  /** Clé de la rareté de base du palier filtré (MYTHIC…), null = tous. */
  tier: string | null;
  /** Table à réserver pour ce pseudo (feuille ouverte d'emblée). */
  reserveFor: string | null;
  /** Revanche : table jouée dont l'adversaire sera réservé. */
  rematchOf: string | null;
};

type Raw = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const ID = /^[A-Za-z0-9_-]{1,40}$/;

/** `tierKeys` : clés acceptées pour ?palier= (première rareté de chaque palier jouable). */
export function parseSalonParams(raw: Raw, tierKeys: readonly string[]): SalonParams {
  const tab = one(raw.onglet);
  const tier = one(raw.palier);
  const reserveFor = one(raw.pour);
  const rematchOf = one(raw.revanche);
  return {
    tab: (SALON_TABS as readonly string[]).includes(tab ?? "") ? (tab as SalonTab) : "tables",
    tier: tier && tierKeys.includes(tier) ? tier : null,
    reserveFor: reserveFor && USERNAME_REGEX.test(reserveFor) ? reserveFor : null,
    rematchOf: rematchOf && ID.test(rematchOf) ? rematchOf : null,
  };
}

/** Lien du salon avec ses filtres (sans les paramètres vides). */
export function salonHref(p: { tab?: SalonTab; tier?: string | null }): string {
  const q = new URLSearchParams();
  if (p.tab && p.tab !== "tables") q.set("onglet", p.tab);
  if (p.tier) q.set("palier", p.tier);
  const s = q.toString();
  return s ? `/casino/pile-ou-face?${s}` : "/casino/pile-ou-face";
}
