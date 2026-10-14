"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Fait suivre l'effet de matière des fuda (laque, or, nacre) à la souris ou à l'inclinaison du
 * téléphone : variables CSS --mx / --my mises à jour dans requestAnimationFrame, seulement quand
 * la carte est à l'écran, et jamais si l'utilisateur préfère réduire les animations.
 */
export function FudaTilt({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    const fuda = el?.querySelector<HTMLElement>(".fuda");
    if (!el || !fuda || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    let target = { x: 0.5, y: 0.5 };
    const apply = () => {
      frame = 0;
      fuda.style.setProperty("--mx", target.x.toFixed(3));
      fuda.style.setProperty("--my", target.y.toFixed(3));
    };
    const schedule = (x: number, y: number) => {
      target = { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
      if (!frame) frame = requestAnimationFrame(apply);
    };

    const onPointer = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      schedule((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    };
    const onLeave = () => schedule(0.5, 0.5);
    // gamma : gauche/droite (−90…90), beta : avant/arrière (−180…180), autour d'une tenue à ~45°
    const onTilt = (e: DeviceOrientationEvent) => {
      if (e.gamma === null || e.beta === null) return;
      schedule(0.5 + e.gamma / 60, 0.5 + (e.beta - 45) / 60);
    };

    let listening = false;
    const start = () => {
      if (listening) return;
      listening = true;
      fuda.classList.add("fuda-live");
      el.addEventListener("pointermove", onPointer);
      el.addEventListener("pointerleave", onLeave);
      window.addEventListener("deviceorientation", onTilt);
    };
    const stop = () => {
      if (!listening) return;
      listening = false;
      fuda.classList.remove("fuda-live");
      el.removeEventListener("pointermove", onPointer);
      el.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("deviceorientation", onTilt);
    };

    const observer = new IntersectionObserver(([entry]) => (entry.isIntersecting ? start() : stop()));
    observer.observe(el);
    return () => {
      observer.disconnect();
      stop();
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
