// Disposition de l'arbre des liens sur le profil (maquette « Arbre » de l'atelier invitation) : le parrain au-dessus, le
// joueur au centre, ses filleuls installés dessous et les leurs au dernier rang, reliés par des fils rouges. Pur : le
// composant dessine le SVG à partir de ces positions. Deux largeurs : téléphone (340, 6 filleuls au plus) et
// ordinateur (640, 10 au plus) ; au-delà, ceux qui ont eux-mêmes des filleuls restent et les autres sont regroupés.

export type TreePerson = { key: string; name: string };
export type TreeInput = { me: TreePerson; up: TreePerson | null; kids: { person: TreePerson; kids: TreePerson[] }[] };

export type TreeNodeAt = { key: string; x: number; y: number; initial: string; label: string };
export type TreeLayout = {
  width: number;
  height: number;
  threads: { d: string; dim: boolean }[];
  up: (TreeNodeAt & { name: string }) | null;
  me: TreeNodeAt;
  kids: TreeNodeAt[];
  /** Filleuls regroupés (« +N autres »). */
  more: { x: number; y: number; count: number } | null;
  grandkids: (TreeNodeAt & { labelY: number; showLabel: boolean })[];
  /** Petits-filleuls regroupés sous un filleul (« +N »). */
  grandMore: { x: number; y: number; count: number }[];
};

const r1 = (n: number) => Math.round(n * 10) / 10;
/** Nom raccourci à `max` caractères (avec « … »). */
export const cut = (s: string, max: number) => (s.length > max ? `${s.slice(0, Math.max(1, max - 1))}…` : s);
const initialOf = (p: TreePerson) => (p.name.charAt(0) || "?").toUpperCase();

export function layoutTree(input: TreeInput, desk: boolean): TreeLayout {
  const W = desk ? 640 : 340;
  const cx = W / 2;
  const cap = desk ? 10 : 6;
  let shown = input.kids;
  let more = 0;
  if (input.kids.length > cap) {
    // Au-delà de la place : on garde ceux qui ont eux-mêmes des filleuls (l'arbre garde ses deux niveaux), puis les
    // premiers arrivés ; les autres sont regroupés dans « +N autres »
    const keep = new Set(
      input.kids
        .map((k, i) => [k, i] as const)
        .sort((a, b) => b[0].kids.length - a[0].kids.length || a[1] - b[1])
        .slice(0, cap - 1)
        .map(([k]) => k),
    );
    shown = input.kids.filter((k) => keep.has(k));
    more = input.kids.length - shown.length;
  }
  const n = shown.length + (more ? 1 : 0);
  const dy = input.up ? 0 : -86;
  const yMe = 112 + dy;
  const yK = 210 + dy;
  const yG = 272 + dy;
  const sp = n > 1 ? Math.min((W - 60) / (n - 1), desk ? 120 : 92) : 0;
  const xs = Array.from({ length: n }, (_, i) => r1(cx - (sp * (n - 1)) / 2 + i * sp));
  const kidChars = n > 1 ? Math.max(4, Math.floor(sp / 6.2)) : 14;

  // Petits-filleuls de chaque filleul montré : 2 ou 3 au plus, puis « +N » ; noms en quinconce quand la place manque
  const groups = shown.map((k) => {
    const g = k.kids;
    const gCap = n === 1 || sp >= 80 ? 3 : 2;
    const list = g.length > gCap ? g.slice(0, gCap - 1) : g;
    const m = list.length + (g.length > list.length ? 1 : 0);
    const gs = n > 1 ? Math.min(30, (sp - 12) / Math.max(1, m)) : 30;
    return { list, extra: g.length - list.length, m, gs, stagger: m > 1 && gs < 30 };
  });
  const anyG = groups.some((g) => g.m > 0);
  const anyStagger = groups.some((g) => g.m > 0 && g.stagger);
  const height = !n ? yMe + 36 : anyG ? yG + 30 + (anyStagger ? 11 : 0) : yK + 44;

  const threads: TreeLayout["threads"] = [];
  if (input.up) threads.push({ d: `M${cx} 44 L${cx} ${yMe - 24}`, dim: false });
  for (const x of xs) threads.push({ d: `M${cx} ${yMe + 20} C ${cx} ${yMe + 56}, ${x} ${yMe + 48}, ${x} ${yK - 16}`, dim: false });

  const grandkids: TreeLayout["grandkids"] = [];
  const grandMore: TreeLayout["grandMore"] = [];
  groups.forEach((grp, i) => {
    if (!grp.m) return;
    const { list, extra, m, gs, stagger } = grp;
    const gx = (j: number) => r1(xs[i] + (j - (m - 1) / 2) * gs);
    const room = m === 1 ? Math.min(n > 1 ? sp - 8 : 80, 80) : stagger ? 2 * gs : gs;
    const chars = Math.max(3, Math.floor(room / 5.4));
    for (let j = 0; j < m; j++) threads.push({ d: `M${xs[i]} ${yK + 16} C ${xs[i]} ${yK + 36}, ${gx(j)} ${yK + 34}, ${gx(j)} ${yG - 9}`, dim: true });
    list.forEach((p, j) => {
      grandkids.push({ key: p.key, x: gx(j), y: yG, initial: initialOf(p), label: cut(p.name, chars), labelY: yG + 22 + (stagger && j % 2 ? 11 : 0), showLabel: gs >= 14 });
    });
    if (extra) grandMore.push({ x: gx(m - 1), y: yG, count: extra });
  });

  return {
    width: W,
    height,
    threads,
    up: input.up ? { key: input.up.key, x: cx, y: 26, initial: initialOf(input.up), label: cut(input.up.name, 16), name: input.up.name } : null,
    me: { key: input.me.key, x: cx, y: yMe, initial: initialOf(input.me), label: cut(input.me.name, 16) },
    kids: shown.map((k, i) => ({ key: k.person.key, x: xs[i], y: yK, initial: initialOf(k.person), label: cut(k.person.name, kidChars) })),
    more: more ? { x: xs[n - 1], y: yK, count: more } : null,
    grandkids,
    grandMore,
  };
}
