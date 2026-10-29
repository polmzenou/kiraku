"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { liteFx, MOTION_EVENT, prefersReducedMotion } from "@/lib/motion-pref-dom";
import "./FudaTilt.css";

// Inclinaison du téléphone partagée : un seul écouteur et une seule image par frame pour toutes les
// fuda à l'écran (une pile de 50 cartes n'en pose plus 50).
type TiltListener = (x: number, y: number) => void;
const tiltListeners = new Set<TiltListener>();
let tiltFrame = 0;
let tiltX = 0.5;
let tiltY = 0.5;
const flushTilt = () => {
  tiltFrame = 0;
  for (const listener of tiltListeners) listener(tiltX, tiltY);
};
// gamma : gauche/droite (−90…90), beta : avant/arrière (−180…180), autour d'une tenue à ~45°
const onOrientation = (e: DeviceOrientationEvent) => {
  if (e.gamma === null || e.beta === null) return;
  tiltX = 0.5 + e.gamma / 60;
  tiltY = 0.5 + (e.beta - 45) / 60;
  if (!tiltFrame) tiltFrame = requestAnimationFrame(flushTilt);
};
function listenTilt(listener: TiltListener) {
  if (tiltListeners.size === 0) window.addEventListener("deviceorientation", onOrientation, { passive: true });
  tiltListeners.add(listener);
  return () => {
    tiltListeners.delete(listener);
    if (tiltListeners.size > 0) return;
    window.removeEventListener("deviceorientation", onOrientation);
    if (tiltFrame) cancelAnimationFrame(tiltFrame);
    tiltFrame = 0;
  };
}

/**
 * Fait suivre l'effet de matière des fuda (laque, or, nacre) à la souris ou à l'inclinaison du
 * téléphone : variables CSS --mx / --my mises à jour dans requestAnimationFrame, seulement quand
 * la carte est à l'écran, et jamais si l'utilisateur préfère réduire les animations (le gyroscope est
 * aussi coupé en effets allégés).
 * `rotate` ajoute une inclinaison 3D au survol et au toucher.
 */
export function FudaTilt({ children, className = "", rotate = true, angle = 16, reactive = true }: { children: ReactNode; className?: string; rotate?: boolean; angle?: number; reactive?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    const fuda = el?.querySelector<HTMLElement>(".fuda");
    if (!el || !fuda) return;
    const focusTarget = el.closest<HTMLElement>("a, button, [tabindex]") ?? el;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let visible = false;
    let target = { x: 0.5, y: 0.5 };
    const apply = () => {
      frame = 0;
      // Matière non réactive : --mx et --my gardent leur valeur par défaut (0,5), rien à réécrire à chaque image
      if (reactive) {
        fuda.style.setProperty("--mx", target.x.toFixed(3));
        fuda.style.setProperty("--my", target.y.toFixed(3));
      }
      if (rotate) {
        fuda.style.setProperty("--fuda-rotate-x", `${((0.5 - target.y) * angle * 1.5).toFixed(2)}deg`);
        fuda.style.setProperty("--fuda-rotate-y", `${((target.x - 0.5) * angle * 2).toFixed(2)}deg`);
      }
    };
    const schedule = (x: number, y: number) => {
      target = { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
      if (!frame) frame = requestAnimationFrame(apply);
    };

    const onPointer = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      schedule((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    };
    const onLeave = () => schedule(0.5, 0.5);
    const onRelease = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") onLeave();
    };
    const onFocus = () => schedule(0.75, 0.25);
    // Appelé dans l'image partagée : on écrit tout de suite
    const onTilt = (x: number, y: number) => {
      target = { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
      if (frame) cancelAnimationFrame(frame);
      apply();
    };

    let listening = false;
    let unlistenTilt: (() => void) | null = null;
    // Ni matière réactive ni rotation : le gyroscope ne changerait rien à l'écran
    const follows = reactive || rotate;
    const stop = () => {
      listening = false;
      fuda.classList.remove("fuda-live");
      el.removeEventListener("pointerdown", onPointer);
      el.removeEventListener("pointermove", onPointer);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("pointerup", onRelease);
      el.removeEventListener("pointercancel", onLeave);
      focusTarget.removeEventListener("focusin", onFocus);
      focusTarget.removeEventListener("focusout", onLeave);
      unlistenTilt?.();
      unlistenTilt = null;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      target = { x: 0.5, y: 0.5 };
      for (const property of ["--mx", "--my", "--fuda-rotate-x", "--fuda-rotate-y"]) {
        fuda.style.removeProperty(property);
      }
    };
    const sync = () => {
      if (!visible || prefersReducedMotion() || document.hidden) return stop();
      // Effets allégés : plus de gyroscope, la souris et le toucher restent
      if (liteFx() || !follows) {
        unlistenTilt?.();
        unlistenTilt = null;
      } else if (listening && !unlistenTilt) {
        unlistenTilt = listenTilt(onTilt);
      }
      if (listening) return;
      listening = true;
      fuda.classList.add("fuda-live");
      el.addEventListener("pointerdown", onPointer, { passive: true });
      el.addEventListener("pointermove", onPointer, { passive: true });
      el.addEventListener("pointerleave", onLeave);
      el.addEventListener("pointerup", onRelease);
      el.addEventListener("pointercancel", onLeave);
      if (rotate) {
        focusTarget.addEventListener("focusin", onFocus);
        focusTarget.addEventListener("focusout", onLeave);
      }
      if (!liteFx() && follows) unlistenTilt = listenTilt(onTilt);
    };

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    });
    observer.observe(el);
    reduced.addEventListener("change", sync);
    window.addEventListener(MOTION_EVENT, sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      observer.disconnect();
      reduced.removeEventListener("change", sync);
      window.removeEventListener(MOTION_EVENT, sync);
      document.removeEventListener("visibilitychange", sync);
      stop();
    };
  }, [rotate, angle, reactive]);

  return (
    <div ref={ref} className={`${rotate ? "kf-tilt" : ""} ${className}`}>
      {children}
    </div>
  );
}
