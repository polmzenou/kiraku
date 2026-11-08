"use client";

import { useEffect, useRef } from "react";

/** Marque la scène qui le contient `data-offscreen` hors de l'écran : ses effets de cartes se figent. */
export function StageObserver() {
  const marker = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const stage = marker.current?.closest<HTMLElement>(".vt-stage");
    if (!stage) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) delete stage.dataset.offscreen;
      else stage.dataset.offscreen = "";
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);
  return <span ref={marker} hidden />;
}
