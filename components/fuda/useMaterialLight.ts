"use client";

import { useEffect, type RefObject } from "react";

/** Reflet sans rendu React, un seul RAF en attente, écoute uniquement à l'écran. */
export function useMaterialLight(ref: RefObject<HTMLElement | null>, disabled = false) {
  useEffect(() => {
    const el = ref.current;
    if (!el || disabled) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = false;
    let listening = false;
    let frame = 0;
    let x = 0.5;
    let y = 0.5;
    const apply = () => {
      frame = 0;
      el.style.setProperty("--mx", x.toFixed(3));
      el.style.setProperty("--my", y.toFixed(3));
    };
    const schedule = (nextX: number, nextY: number) => {
      x = Math.min(1, Math.max(0, nextX));
      y = Math.min(1, Math.max(0, nextY));
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const onPointer = (event: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      if (rect.width && rect.height) schedule((event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height);
    };
    const onLeave = () => schedule(0.5, 0.5);
    const onTilt = (event: DeviceOrientationEvent) => {
      if (event.gamma !== null && event.beta !== null) schedule(0.5 + event.gamma / 60, 0.5 + (event.beta - 45) / 60);
    };
    const stop = () => {
      el.removeAttribute("data-live");
      el.removeEventListener("pointermove", onPointer);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("pointercancel", onLeave);
      window.removeEventListener("deviceorientation", onTilt);
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      el.style.removeProperty("--mx");
      el.style.removeProperty("--my");
      listening = false;
    };
    const sync = () => {
      if (!visible || reduced.matches || document.hidden) return stop();
      if (listening) return;
      listening = true;
      el.setAttribute("data-live", "true");
      el.addEventListener("pointermove", onPointer, { passive: true });
      el.addEventListener("pointerleave", onLeave);
      el.addEventListener("pointercancel", onLeave);
      window.addEventListener("deviceorientation", onTilt, { passive: true });
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    });
    observer.observe(el);
    reduced.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      observer.disconnect();
      reduced.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
      stop();
    };
  }, [ref, disabled]);
}

