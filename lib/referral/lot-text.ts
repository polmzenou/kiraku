// Texte d'un lot du parrainage, pour le bot Discord de l'équipe (« 20 boosters Tout anime · 1 booster divin ·
// 2 000 Zeni »), et nom de booster sans le mot « booster » déjà écrit par le texte. Pur.

export type LotTextLine =
  | { kind: "BOOSTER"; quantity: number; name: string }
  | { kind: "CARD"; quantity: number; name: string }
  | { kind: "RARITY_CARD"; quantity: number; rarity: string };
export type LotTextInput = { zeni: number; lines: readonly LotTextLine[] };

/** Nom d'un booster sans le mot « booster » déjà écrit par le texte (« Booster divin » → « divin », « Divine booster » → « Divine »). */
export function boosterWord(name: string): string {
  const bare = name.replace(/^booster\s+/i, "").replace(/\s+booster$/i, "").trim();
  return bare || name;
}

const nf = new Intl.NumberFormat("fr-FR");
const plural = (n: number, one: string, many: string) => `${nf.format(n)} ${n > 1 ? many : one}`;

/** Le lot en une ligne, en français ; `multiplier` : ×2 de l'Ennichi. Un lot vide ou absent donne null. */
export function lotText(lot: LotTextInput | null, rarityName: (key: string) => string, multiplier = 1): string | null {
  if (!lot) return null;
  const m = Math.max(1, multiplier);
  const parts = lot.lines.map((l) => {
    const n = l.quantity * m;
    if (l.kind === "BOOSTER") return plural(n, `booster ${boosterWord(l.name)}`, `boosters ${boosterWord(l.name)}`);
    if (l.kind === "CARD") return n > 1 ? `${nf.format(n)} × ${l.name}` : l.name;
    return plural(n, `carte ${rarityName(l.rarity)} au hasard`, `cartes ${rarityName(l.rarity)} au hasard`);
  });
  if (lot.zeni > 0) parts.push(`${nf.format(lot.zeni * m)} Zeni`);
  return parts.length ? parts.join(" · ") : null;
}
