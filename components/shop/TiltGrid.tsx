"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { liteFx, prefersReducedMotion } from "@/lib/motion-pref-dom";

const clamp = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Inclinaison des scènes de packs à la souris, pour toute la grille : un seul écouteur et une seule
 * image rAF à la fois, sur la carte survolée seulement. Comme dans la scène d'ouverture, on écrit
 * transform directement sur la scène (une variable héritée invaliderait tout le dessin à chaque
 * image) et --tx sur le seul reflet des sachets. Rien au toucher, en effets allégés ni réduits.
 */
export function TiltGrid({ children, className = "" }: { children: ReactNode; className?: string }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let scene: HTMLElement | null = null;
    let glints: HTMLElement[] = [];
    let holos: HTMLElement[] = [];
    let frame = 0;
    let px = 0.5;
    let py = 0.5;

    const apply = () => {
      frame = 0;
      if (!scene) return;
      scene.style.transform = `perspective(700px) rotateX(${((0.5 - py) * 10).toFixed(2)}deg) rotateY(${((px - 0.5) * 16).toFixed(2)}deg)`;
      for (const g of glints) g.style.setProperty("--tx", px.toFixed(3));
      for (const h of holos) {
        h.style.setProperty("--mx", `${(px * 100).toFixed(1)}%`);
        h.style.setProperty("--my", `${(py * 100).toFixed(1)}%`);
      }
    };
    const release = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      if (scene) {
        // Retour au repos par la transition de shop.css
        scene.style.transition = "";
        scene.style.transform = "";
        scene.style.willChange = "";
      }
      for (const g of glints) g.style.removeProperty("--tx");
      for (const h of holos) {
        h.style.removeProperty("--mx");
        h.style.removeProperty("--my");
      }
      scene = null;
      glints = [];
      holos = [];
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const card = (e.target as Element | null)?.closest<HTMLElement>(".shop-pack") ?? null;
      const next = card?.querySelector<HTMLElement>(".shop-tilt") ?? null;
      if (next !== scene) {
        release();
        if (!next || prefersReducedMotion() || liteFx()) return;
        scene = next;
        scene.style.transition = "transform 90ms linear";
        scene.style.willChange = "transform";
        glints = [...next.querySelectorAll<HTMLElement>(".booster-glint")];
        holos = [...next.querySelectorAll<HTMLElement>(".shop-holo")];
      }
      // Entre les cartes (titres, gouttières) ou sur une carte sans scène : rien à incliner
      if (!scene || !card) return;
      const rect = card.getBoundingClientRect();
      px = clamp((e.clientX - rect.left) / rect.width);
      py = clamp((e.clientY - rect.top) / rect.height);
      if (!frame) frame = requestAnimationFrame(apply);
    };

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", release);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", release);
      release();
    };
  }, []);

  return (
    <div ref={root} className={className}>
      {children}
    </div>
  );
}
