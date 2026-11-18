// Budget de contextes WebGL : les navigateurs en limitent le nombre (une quinzaine), et chaque carte spectrale
// vivante en tient un. Au-delà du budget, la carte garde son repli CSS.

export const GL_BUDGET = 4;
let used = 0;

/** Réserve une place ; renvoie de quoi la rendre (une seule fois), ou null si le budget est plein. */
export function acquireGl(max = GL_BUDGET): (() => void) | null {
  if (used >= max) return null;
  used++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    used--;
  };
}

/** Places prises (tests). */
export function glInUse(): number {
  return used;
}
