// Vitrine du profil : une case par position, null = vide. Une carte n'y apparaît qu'une fois.

export type ShowcaseSlots = (string | null)[];

export const MAX_SHOWCASE_SLOTS = 100;

/** Vitrine complétée à `size` cases, ou null si elle est trop longue ou contient une carte deux fois. */
export function normalizeShowcase(slots: readonly (string | null)[], size: number): ShowcaseSlots | null {
  if (slots.length > size) return null;
  const filled = slots.filter((s): s is string => s !== null);
  if (new Set(filled).size !== filled.length) return null;
  return [...slots, ...Array<null>(size - slots.length).fill(null)];
}

/** Échange deux cases (glisser-déposer ou boutons ← →). */
export function swapSlots<T>(slots: readonly T[], from: number, to: number): T[] {
  const next = [...slots];
  if (from === to || from < 0 || to < 0 || from >= slots.length || to >= slots.length) return next;
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/** Place `cardId` en case `index` ; si elle était déjà ailleurs, cette case se vide. */
export function placeInSlot(slots: readonly (string | null)[], index: number, cardId: string | null): ShowcaseSlots {
  return slots.map((s, i) => (i === index ? cardId : cardId !== null && s === cardId ? null : s));
}

export type SlotRect = { left: number; top: number; width: number; height: number };

/** Case sous le point (x, y), sinon la plus proche de son centre ; -1 sans case. */
export function slotAtPoint(x: number, y: number, rects: readonly SlotRect[]): number {
  const inside = rects.findIndex((r) => x >= r.left && x <= r.left + r.width && y >= r.top && y <= r.top + r.height);
  if (inside >= 0) return inside;
  let best = -1;
  let bestDistance = Infinity;
  rects.forEach((r, i) => {
    const d = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2));
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  });
  return best;
}
