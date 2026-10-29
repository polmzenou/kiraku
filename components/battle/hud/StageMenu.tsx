"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { setBattleSpeed, SPEEDS, type BattleSpeed } from "../stage/useBattleSpeed";

/**
 * Menu du combat (plein écran) : son, musique, vitesse des animations, puis les actions passées par le
 * parent (abandonner, revenir aux combats). Se ferme avec Échap ou en touchant à côté.
 */
export function StageMenu({
  sound,
  music,
  speed,
  children,
}: {
  sound: { enabled: boolean; set: (on: boolean) => void };
  music: { enabled: boolean; set: (on: boolean) => void };
  speed: BattleSpeed;
  children?: ReactNode;
}) {
  const t = useTranslations("battle.menu");
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", close);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("pointerdown", close);
    };
  }, [open]);
  const toggle = (label: string, on: boolean, set: (v: boolean) => void) => (
    <button type="button" className="menu-row" aria-pressed={on} onClick={() => set(!on)}>
      <span>{label}</span>
      <span className="menu-state">{on ? t("on") : t("off")}</span>
    </button>
  );
  return (
    <div ref={root} className="stage-menu" onPointerDown={(e) => e.stopPropagation()}>
      <button type="button" className="menu-button" aria-expanded={open} aria-controls={id} aria-label={open ? t("close") : t("open")} onClick={() => setOpen(!open)}>
        <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>
      {open && (
        <div id={id} className="menu-panel">
          {toggle(t("sound"), sound.enabled, sound.set)}
          {toggle(t("music"), music.enabled, music.set)}
          <fieldset className="menu-speed">
            <legend>{t("speed")}</legend>
            {SPEEDS.map((v) => (
              <button key={v} type="button" aria-pressed={speed === v} onClick={() => setBattleSpeed(v)}>
                {t("speedValue", { value: v })}
              </button>
            ))}
          </fieldset>
          {children}
        </div>
      )}
    </div>
  );
}
