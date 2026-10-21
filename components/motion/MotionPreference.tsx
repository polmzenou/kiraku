"use client";

import { MotionConfig, useReducedMotion } from "motion/react";
import { createContext, useContext, useState, type ReactNode } from "react";
import type { MotionPref } from "@/lib/motion-pref";
import { applyMotionPref } from "@/lib/motion-pref-dom";

type Value = { pref: MotionPref; setPref: (pref: MotionPref) => void };

const MotionPreferenceContext = createContext<Value>({ pref: "full", setPref: () => {} });

/**
 * Réglage « Animations » de l'engrenage : lu dans un cookie par le layout (pas de flash au
 * chargement), il coupe aussi les animations Motion de toute l'app.
 */
export function MotionPreferenceProvider({ initial, children }: { initial: MotionPref; children: ReactNode }) {
  const [pref, setState] = useState(initial);
  const setPref = (next: MotionPref) => {
    setState(next);
    applyMotionPref(next);
  };
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
