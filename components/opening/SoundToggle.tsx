"use client";

import { useTranslations } from "next-intl";
import { playSound } from "@/lib/sound/synth";

/** Bouton son et vibrations, mémorisé ; coupé par défaut. */
export function SoundToggle({ enabled, onChange }: { enabled: boolean; onChange: (on: boolean) => void }) {
  const t = useTranslations("opening");
  return (
    <button
      type="button"
      aria-pressed={enabled}
      onClick={() => {
        onChange(!enabled);
        // Premier geste : le contexte audio peut démarrer, et on confirme d'un petit son
        if (!enabled) playSound("bell", 0.35);
      }}
      className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-surface/80 px-3 text-sm backdrop-blur aria-pressed:border-kin aria-pressed:text-kin"
    >
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 5 6 9H3v6h3l5 4z" />
        {enabled ? (
          <>
            <path d="M15.5 8.5a5 5 0 0 1 0 7" />
            <path d="M18.5 5.5a9 9 0 0 1 0 13" />
          </>
        ) : (
          <path d="m16 9 5 6m0-6-5 6" />
        )}
      </svg>
      {enabled ? t("soundOn") : t("soundOff")}
    </button>
  );
}
