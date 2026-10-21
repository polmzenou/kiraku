"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { useMotionPreference } from "../motion/MotionPreference";
import { Switch } from "../ui/Choice";

/** Engrenage de l'ouverture, à côté du son : réglages d'affichage de l'appareil (animations). */
export function SettingsMenu() {
  const t = useTranslations("header");
  const { pref, setPref } = useMotionPreference();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const hintId = useId();

  // Fermeture au clic dehors ou à Échap
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      root.current?.querySelector<HTMLButtonElement>("button")?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        aria-label={t("settings")}
        title={t("settings")}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-border bg-surface/80 text-text-muted backdrop-blur hover:text-text aria-expanded:border-kin aria-expanded:text-kin"
      >
        <GearIcon />
      </button>
      {open && (
        <div
          id={panelId}
          role="group"
          aria-label={t("settings")}
          className="absolute top-full right-0 z-50 mt-2 w-64 rounded-card border border-border bg-surface p-3 shadow-[0_12px_32px_rgb(0_0_0/0.35)]"
        >
          <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
            <span className="flex flex-col">
              <span className="text-sm font-bold">{t("animations")}</span>
              <span id={hintId} className="text-xs text-text-muted">
                {t("animationsHint")}
              </span>
            </span>
            <Switch
              checked={pref === "full"}
              aria-describedby={hintId}
              onChange={(e) => setPref(e.currentTarget.checked ? "full" : "reduced")}
            />
          </label>
        </div>
      )}
    </div>
  );
}

function GearIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  );
}
