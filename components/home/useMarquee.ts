"use client";

import { useEffect, useRef, type DragEvent, type FocusEvent, type MouseEvent, type PointerEvent } from "react";
import { flingVelocity, relaxVelocity, wrap } from "@/lib/home/marquee";

/** Écart horizontal (px) avant qu'un appui devienne un glissement. */
const DRAG_SLOP = 6;
/** Retour à la vitesse de croisière après un lancer (s). */
const RELAX_TAU = 0.4;
const MAX_FLING = 2000;

/**
 * Ruban sans fin qu'on peut aussi faire glisser : la piste avance à vitesse constante (une
 * demi-largeur en `periodSeconds`), suit le doigt ou la souris pendant un glissement, garde l'élan du
 * lancer puis revient d'elle-même à sa vitesse de croisière. En pause au survol, au focus clavier
 * et onglet caché. Seul le `transform` de la piste change, image par image, sans rendu React.
 */
/** Place la piste (seul le transform change). */
function place(el: HTMLElement | null, x: number | null) {
  if (el) el.style.transform = x === null ? "" : `translate3d(${x}px, 0, 0)`;
}

export function useMarquee<T extends HTMLElement>({ enabled, periodSeconds }: { enabled: boolean; periodSeconds: number }) {
  const track = useRef<T>(null);
  const state = useRef({
    x: 0,
    velocity: 0,
    period: 0,
    hovered: false,
    focused: false,
    pointer: null as null | { id: number; startX: number; startY: number; x0: number; dragging: boolean; samples: { x: number; t: number }[] },
    suppressClick: false,
  });

  // La période (demi-piste) change avec la largeur de l'écran et la liste des tirages
  useEffect(() => {
    const el = track.current;
    if (!el || !enabled) return;
    const measure = () => {
      state.current.period = el.scrollWidth / 2;
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [track, enabled]);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    if (!enabled) {
      place(el, null);
      return;
    }
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min(now - last, 64) / 1000;
      last = now;
      const s = state.current;
      if (document.hidden || s.pointer?.dragging || !s.period) return;
      const cruise = s.hovered || s.focused ? 0 : -s.period / periodSeconds;
      s.velocity = relaxVelocity(s.velocity, cruise, dt, RELAX_TAU);
      s.x = wrap(s.x + s.velocity * dt, s.period);
      place(el, s.x);
    };
    // Départ directement à la vitesse de croisière
    state.current.velocity = state.current.period ? -state.current.period / periodSeconds : 0;
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [track, enabled, periodSeconds]);

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if (!enabled || !e.isPrimary || (e.pointerType === "mouse" && e.button !== 0)) return;
    const s = state.current;
    s.suppressClick = false;
    s.pointer = { id: e.pointerId, startX: e.clientX, startY: e.clientY, x0: s.x, dragging: false, samples: [{ x: e.clientX, t: e.timeStamp }] };
  };
  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const s = state.current;
    const p = s.pointer;
    if (!p || p.id !== e.pointerId) return;
    const dx = e.clientX - p.startX;
    if (!p.dragging) {
      if (Math.abs(dx) < DRAG_SLOP || Math.abs(dx) < Math.abs(e.clientY - p.startY)) return;
      p.dragging = true;
      s.suppressClick = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    p.samples.push({ x: e.clientX, t: e.timeStamp });
    if (p.samples.length > 5) p.samples.shift();
    s.x = wrap(p.x0 + dx, s.period);
    place(track.current, s.x);
  };
  const onPointerEnd = (e: PointerEvent<HTMLElement>) => {
    const s = state.current;
    const p = s.pointer;
    if (!p || p.id !== e.pointerId) return;
    s.pointer = null;
    if (!p.dragging) return;
    // Seuls les points récents comptent : un doigt qui s'arrête avant de lâcher ne lance rien
    const recent = p.samples.filter((pt) => e.timeStamp - pt.t < 120);
    s.velocity = flingVelocity(recent, MAX_FLING);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const handlers = {
    onPointerDown,
    onPointerMove,
    onPointerUp: onPointerEnd,
    onPointerCancel: onPointerEnd,
    onPointerEnter: (e: PointerEvent<HTMLElement>) => {
      if (e.pointerType === "mouse") state.current.hovered = true;
    },
    onPointerLeave: (e: PointerEvent<HTMLElement>) => {
      if (e.pointerType === "mouse") state.current.hovered = false;
    },
    // Pause au focus clavier seulement : un appui ou un glissement donne aussi le focus au lien
    onFocus: (e: FocusEvent<HTMLElement>) => {
      if (e.target.matches(":focus-visible")) state.current.focused = true;
    },
    onBlur: (e: FocusEvent<HTMLElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) state.current.focused = false;
    },
    // Un glissement ne doit ni ouvrir la fiche sous le doigt, ni lancer le glisser-déposer natif
    onClickCapture: (e: MouseEvent<HTMLElement>) => {
      if (!state.current.suppressClick) return;
      state.current.suppressClick = false;
      e.preventDefault();
      e.stopPropagation();
    },
    onDragStart: (e: DragEvent<HTMLElement>) => {
      if (enabled) e.preventDefault();
    },
  };
  return { track, handlers };
}
