"use client";

import { MotionConfig, useReducedMotion } from "motion/react";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { MotionPref } from "@/lib/motion-pref";
import { applyMotionPref, MOTION_EVENT } from "@/lib/motion-pref-dom";
import { useMeasuredTier } from "./fx-tier";

type Value = { pref: MotionPref; setPref: (pref: MotionPref) => void };

const MotionPreferenceContext = createContext<Value>({ pref: "auto", setPref: () => {} });

/** Effets réellement joués : complets, allégés (appareil qui rame ou choix du joueur) ou coupés. */
export type FxLevel = "full" | "lite" | "reduced";

/**
 * Réglage « Animations » de l'engrenage : lu dans un cookie par le layout (pas de flash au
 * chargement), il coupe aussi les animations Motion de toute l'app. Le niveau allégé est posé sur
 * <html> (`data-fx="lite"`) pour les règles CSS et les écouteurs hors React.
 */
export function MotionPreferenceProvider({ initial, children }: { initial: MotionPref; children: ReactNode }) {
  const [pref, setState] = useState(initial);
  const setPref = (next: MotionPref) => {
    setState(next);
    applyMotionPref(next);
  };
  const measured = useMeasuredTier();
  const lite = pref === "lite" || (pref === "auto" && measured === "lite");
  useEffect(() => {
    const root = document.documentElement;
    if ((root.dataset.fx === "lite") === lite) return;
    if (lite) root.dataset.fx = "lite";
    else delete root.dataset.fx;
    window.dispatchEvent(new Event(MOTION_EVENT));
  }, [lite]);
  return (
    <MotionPreferenceContext.Provider value={{ pref, setPref }}>
      <MotionConfig reducedMotion={pref === "reduced" ? "always" : "user"}>{children}</MotionConfig>
    </MotionPreferenceContext.Provider>
  );
}

export const useMotionPreference = () => useContext(MotionPreferenceContext);

/** Mouvement réduit : réglage du système ou animations coupées dans l'engrenage. */
export function useReducedFx(): boolean {
  const os = useReducedMotion() ?? false;
  const { pref } = useContext(MotionPreferenceContext);
  return os || pref === "reduced";
}

/** Niveau d'effets à jouer : le réglage du joueur, ou en « auto » la fluidité mesurée de l'appareil. */
export function useFxLevel(): FxLevel {
  const reduced = useReducedFx();
  const { pref } = useContext(MotionPreferenceContext);
  const measured = useMeasuredTier();
  if (reduced) return "reduced";
  if (pref === "lite" || (pref === "auto" && measured === "lite")) return "lite";
  return "full";
}
