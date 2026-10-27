// Déroulé impératif des célébrations d'achat, en Web Animations : transform et opacity seulement.
// « Passer » termine d'un coup les animations en cours et annule la suite ; en mouvement réduit, le
// déroulé part déjà passé et montre directement l'image finale. Le CSS global des animations réduites
// ne couvre pas element.animate() : c'est ce drapeau qui s'en charge.

export type Timeline = {
  skipped: boolean;
  anims: Animation[];
  waits: { id: ReturnType<typeof setTimeout>; resolve: () => void }[];
  laters: ReturnType<typeof setTimeout>[];
};

export const EASE = "cubic-bezier(.2,.8,.25,1)";
export const SPRING = "cubic-bezier(.34,1.56,.64,1)";

export function createTimeline(skipped: boolean): Timeline {
  return { skipped, anims: [], waits: [], laters: [] };
}

/** Anime un nœud ; une fois passé, l'animation est instantanée et laisse l'état final. */
export function animate(tl: Timeline, node: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions): Animation {
  const o: KeyframeAnimationOptions = { fill: "both", easing: EASE, ...options };
  if (tl.skipped) {
    o.duration = 0;
    o.delay = 0;
  }
  const a = node.animate(keyframes, o);
  tl.anims.push(a);
  return a;
}

/** Pause du déroulé, levée tout de suite si l'on passe. */
export function wait(tl: Timeline, ms: number): Promise<void> {
  if (tl.skipped) return Promise.resolve();
  return new Promise((resolve) => {
    const id = setTimeout(resolve, ms);
    tl.waits.push({ id, resolve });
  });
}

/** Effet décalé (son, rebond, bouquet secondaire), annulé si l'on passe. */
export function later(tl: Timeline, ms: number, fn: () => void) {
  if (tl.skipped) return;
  tl.laters.push(setTimeout(fn, ms));
}

export function skip(tl: Timeline) {
  if (tl.skipped) return;
  tl.skipped = true;
  tl.laters.forEach(clearTimeout);
  tl.waits.forEach(({ id, resolve }) => {
    clearTimeout(id);
    resolve();
  });
  for (const a of tl.anims) {
    try {
      a.finish();
    } catch {
      // Déjà terminée ou annulée
    }
  }
}

/** Démontage : plus rien ne tourne, le déroulé se termine sans effet. */
export function dispose(tl: Timeline) {
  skip(tl);
  tl.anims.forEach((a) => a.cancel());
}

/** Particule retirée du DOM une fois son animation finie (ou annulée). */
export function removeWhenDone(a: Animation, node: Element) {
  a.finished.then(
    () => node.remove(),
    () => node.remove(),
  );
}
