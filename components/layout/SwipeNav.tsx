"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { flingVelocity } from "@/lib/home/marquee";
import {
  classifySwipe,
  dragOffset,
  exitDuration,
  isSwipeRoot,
  lockAxis,
  SWIPE_EDGE,
  swipeNeighbor,
  type SwipeDirection,
} from "@/lib/swipe-nav";
import { useReducedFx } from "../motion/MotionPreference";

const MOBILE = "(max-width: 63.999rem)";
/** La sortie part à la vitesse du doigt ; l'arrivée et le retour freinent en douceur. */
const EXIT_EASING = "cubic-bezier(0.3, 0.6, 0.6, 1)";
const SETTLE_EASING = "cubic-bezier(0.2, 0.9, 0.3, 1)";
const ENTER_EASING = "cubic-bezier(0.16, 1, 0.3, 1)";
const SETTLE_MS = 280;
const ENTER_MS = 340;
/** Parts de la largeur : distance de sortie, et décalage d'où entre la nouvelle page. */
const EXIT_SHIFT = 0.6;
const ENTER_SHIFT = 0.22;
/** Baisse d'opacité maximale sous le doigt. */
const DRAG_FADE = 0.35;
/** Fenêtre (ms) des points qui comptent pour la vitesse au lâcher, et vitesse plafond (px/s). */
const VELOCITY_WINDOW_MS = 100;
const MAX_FLING = 4000;
/** Si la page suivante n'arrive jamais (réseau coupé), on réaffiche la page courante. */
const ARRIVAL_TIMEOUT_MS = 4000;
const IGNORE = "input, textarea, select, [contenteditable], [data-swipe-ignore]";

type Pose = { x: number; opacity: number };
type Gesture = {
  x: number;
  y: number;
  dx: number;
  dy: number;
  /** Décalage déjà affiché quand le doigt a repris une animation en cours. */
  base: number;
  axis: "x" | "y" | null;
  samples: { x: number; t: number }[];
};

const REST: Pose = { x: 0, opacity: 1 };

/**
 * Sur mobile, glisser le doigt sur un onglet de la capsule passe à l'onglet voisin.
 * Écouteurs passifs : le défilement vertical reste natif. Sous le doigt, une seule écriture de
 * `transform`/`opacity` par image ; au lâcher, des animations Web (jouées par le compositeur, donc
 * fluides même pendant le rendu de la page suivante) prennent le relais depuis la position exacte,
 * à la vitesse du doigt. Tout est retiré à la fin pour ne pas piéger les `position: fixed`.
 * Mouvement réduit : navigation directe, sans glissement.
 */
export function SwipeNav({ children }: { children: ReactNode }) {
  const surface = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  const reduced = useReducedFx();
  const motion = useRef<Animation | null>(null);
  const arriving = useRef<SwipeDirection | null>(null);
  const arrivalTimer = useRef(0);

  // Arrivée après un glissement : la nouvelle page entre par le côté opposé
  useEffect(() => {
    const el = surface.current;
    const direction = arriving.current;
    if (!el || !direction) return;
    arriving.current = null;
    window.clearTimeout(arrivalTimer.current);
    if (reduced) return;
    const shift = (direction === "next" ? 1 : -1) * window.innerWidth * ENTER_SHIFT;
    play(motion, el, { x: shift, opacity: 0 }, REST, ENTER_MS, ENTER_EASING);
  }, [pathname, reduced]);

  // Les voisins sont préchargés pour que l'arrivée soit quasi immédiate
  useEffect(() => {
    if (!isSwipeRoot(pathname) || !window.matchMedia(MOBILE).matches) return;
    for (const direction of ["next", "prev"] as const) {
      const href = swipeNeighbor(pathname, direction);
      if (href) router.prefetch(href);
    }
  }, [pathname, router]);

  useEffect(() => {
    const el = surface.current;
    if (!el || !isSwipeRoot(pathname)) return;
    let gesture: Gesture | null = null;
    let pose = REST;
    let frame = 0;

    const draw = () => {
      frame = 0;
      el.style.transform = `translate3d(${pose.x}px,0,0)`;
      el.style.opacity = String(pose.opacity);
    };
    const settle = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      if (!reduced && pose !== REST) play(motion, el, pose, REST, SETTLE_MS, SETTLE_EASING);
      pose = REST;
    };

    const onStart = (e: TouchEvent) => {
      gesture = null;
      if (e.touches.length !== 1 || arriving.current || !canStart(e, el)) return;
      const touch = e.touches[0];
      gesture = { x: touch.clientX, y: touch.clientY, dx: 0, dy: 0, base: 0, axis: null, samples: [{ x: touch.clientX, t: e.timeStamp }] };
    };

    const onMove = (e: TouchEvent) => {
      const g = gesture;
      if (!g) return;
      if (e.touches.length !== 1) {
        gesture = null;
        if (g.axis === "x") settle();
        return;
      }
      const touch = e.touches[0];
      g.dx = touch.clientX - g.x;
      g.dy = touch.clientY - g.y;
      g.samples.push({ x: touch.clientX, t: e.timeStamp });
      if (g.samples.length > 6) g.samples.shift();
      if (!g.axis) {
        g.axis = lockAxis(g.dx, g.dy);
        if (g.axis === "x" && !reduced) {
          // Le doigt reprend une animation en cours : on part de la position affichée
          if (motion.current) {
            g.base = shown(el).x;
            motion.current.cancel();
            motion.current = null;
          }
          el.style.willChange = "transform, opacity";
        }
      }
      if (g.axis === "y") {
        gesture = null;
        return;
      }
      if (g.axis !== "x" || reduced) return;
      const dx = g.base + g.dx;
      const x = dragOffset(dx, swipeNeighbor(pathname, dx < 0 ? "next" : "prev") !== null);
      pose = { x, opacity: 1 - Math.min(Math.abs(x) / window.innerWidth, 1) * DRAG_FADE };
      if (!frame) frame = requestAnimationFrame(draw);
    };

    const onEnd = (e: TouchEvent) => {
      const g = gesture;
      gesture = null;
      if (!g || g.axis !== "x") return;
      const recent = g.samples.filter((point) => e.timeStamp - point.t < VELOCITY_WINDOW_MS);
      const velocity = flingVelocity(recent, MAX_FLING) / 1000;
      const width = window.innerWidth;
      const direction = classifySwipe({ dx: g.base + g.dx, dy: g.dy, velocity, width });
      const href = direction && swipeNeighbor(pathname, direction);
      if (!direction || !href) return settle();
      cancelAnimationFrame(frame);
      frame = 0;
      arriving.current = direction;
      arrivalTimer.current = window.setTimeout(() => {
        arriving.current = null;
        if (motion.current) play(motion, el, shown(el), REST, SETTLE_MS, SETTLE_EASING);
      }, ARRIVAL_TIMEOUT_MS);
      if (reduced) return router.push(href);
      const target = (direction === "next" ? -1 : 1) * width * EXIT_SHIFT;
      const exit = play(motion, el, pose, { x: target, opacity: 0 }, exitDuration(target - pose.x, velocity), EXIT_EASING, true);
      pose = REST;
      // Navigation à la fin de la sortie : la page suivante ne doit pas partir dans le mauvais sens
      exit.finished.then(() => router.push(href), () => {});
    };

    const onCancel = () => {
      const g = gesture;
      gesture = null;
      if (g?.axis === "x") settle();
    };

    const options = { passive: true };
    el.addEventListener("touchstart", onStart, options);
    el.addEventListener("touchmove", onMove, options);
    el.addEventListener("touchend", onEnd, options);
    el.addEventListener("touchcancel", onCancel, options);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onCancel);
    };
  }, [pathname, reduced, router]);

  // `overflow-x: clip` : le contenu décalé ne crée pas de défilement horizontal (et, contrairement à
  // `hidden`, ne casse pas les `sticky`).
  return (
    <div className="overflow-x-clip">
      <div ref={surface}>{children}</div>
    </div>
  );
}

/** Anime de `from` à `to` ; `hold` garde la pose finale (sortie), sinon la page redevient intacte. */
function play(motion: RefObject<Animation | null>, el: HTMLElement, from: Pose, to: Pose, duration: number, easing: string, hold = false) {
  motion.current?.cancel();
  el.style.willChange = "transform, opacity";
  const animation = el.animate([keyframe(from), keyframe(to)], { duration, easing, fill: hold ? "forwards" : "none" });
  el.style.removeProperty("transform");
  el.style.removeProperty("opacity");
  motion.current = animation;
  if (!hold) {
    animation.onfinish = () => {
      if (motion.current !== animation) return;
      motion.current = null;
      el.style.removeProperty("will-change");
    };
  }
  return animation;
}

/** Pose affichée à cet instant, animation en cours comprise. */
function shown(el: HTMLElement): Pose {
  const style = getComputedStyle(el);
  return { x: new DOMMatrixReadOnly(style.transform === "none" ? undefined : style.transform).m41, opacity: Number(style.opacity) };
}

function keyframe({ x, opacity }: Pose): Keyframe {
  return { transform: `translate3d(${x}px,0,0)`, opacity };
}

/** Le geste peut-il changer d'onglet ? Pas au bord (retour système), ni dans un champ, une zone qui défile ou une modale. */
function canStart(e: TouchEvent, surface: HTMLElement): boolean {
  if (!window.matchMedia(MOBILE).matches) return false;
  if ((window.visualViewport?.scale ?? 1) > 1.01) return false;
  const x = e.touches[0].clientX;
  if (x < SWIPE_EDGE || x > window.innerWidth - SWIPE_EDGE) return false;
  if (document.querySelector("dialog[open], [aria-modal='true']")) return false;
  const target = e.target;
  if (!(target instanceof Element) || target.closest(IGNORE)) return false;
  return !scrollsHorizontally(target, surface);
}

function scrollsHorizontally(from: Element, stop: Element): boolean {
  for (let node: Element | null = from; node && node !== stop; node = node.parentElement) {
    if (node.scrollWidth > node.clientWidth + 1) {
      const { overflowX } = getComputedStyle(node);
      if (overflowX === "auto" || overflowX === "scroll") return true;
    }
  }
  return false;
}
