// Cases d'une vitrine : une par position, null = vide. Une carte n'y apparaît qu'une fois.

export type ShowcaseSlots = (string | null)[];

/** Vitrine complétée à `size` cases, ou null si elle est trop longue ou contient une carte deux fois. */
export function normalizeShowcase(slots: readonly (string | null)[], size: number): ShowcaseSlots | null {
  if (slots.length > size) return null;
  const filled = slots.filter((s): s is string => s !== null);
  if (new Set(filled).size !== filled.length) return null;
  return [...slots, ...Array<null>(size - slots.length).fill(null)];
}

/**
 * Cases ramenées à `capacity` (changement de disposition). Si tout tient, les positions ne bougent
 * pas ; sinon les cartes sont resserrées dans leur ordre et les dernières sortent de la vitrine.
 */
export function fitToCapacity(slots: readonly (string | null)[], capacity: number): ShowcaseSlots {
  const fits = slots.every((s, i) => i < capacity || s === null);
  const kept = fits ? slots.slice(0, capacity) : slots.filter((s): s is string => s !== null).slice(0, capacity);
  return [...kept, ...Array<null>(capacity - kept.length).fill(null)];
}

/** Ajoute des cartes dans les premières cases libres ; null si la place manque. Les doublons sont ignorés. */
export function addToSlots(slots: readonly (string | null)[], cardIds: readonly string[]): ShowcaseSlots | null {
  const next = [...slots];
  for (const cardId of new Set(cardIds)) {
    if (next.includes(cardId)) continue;
    const free = next.indexOf(null);
    if (free < 0) return null;
    next[free] = cardId;
  }
  return next;
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
