"use client";

import { m, useSpring, useTransform } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

const SPRING = { stiffness: 120, damping: 20, mass: 0.6 };

/**
 * Un anneau qui se remplit de 0 à 1 sans jamais animer autre chose qu'un transform : deux demi-anneaux
 * qui tournent dans deux demi-disques (même technique que le minuteur du combat).
 */
function Arc({ value, className, inset, reduced }: { value: number; className: string; inset: number; reduced: boolean }) {
  const first = Math.min(value, 0.5) * 360;
  const second = Math.max(value - 0.5, 0) * 360;
  const transition = reduced ? { duration: 0 } : { type: "spring" as const, ...SPRING };
  return (
    <>
      <span aria-hidden="true" className="absolute [clip-path:inset(0_0_0_50%)]" style={{ inset }}>
        <m.span
          className={`absolute inset-0 rounded-full border-[7px] [clip-path:inset(0_50%_0_0)] ${className}`}
          initial={false}
          animate={{ rotate: first }}
          transition={transition}
        />
      </span>
      <span aria-hidden="true" className="absolute [clip-path:inset(0_50%_0_0)]" style={{ inset }}>
        <m.span
          className={`absolute inset-0 rounded-full border-[7px] [clip-path:inset(0_0_0_50%)] ${className}`}
          initial={false}
          animate={{ rotate: second }}
          transition={transition}
        />
      </span>
    </>
  );
}

/** Chiffre qui défile jusqu'à sa valeur (ressort), sans rendu React à chaque image. */
function Rolling({ value, reduced }: { value: number; reduced: boolean }) {
  const spring = useSpring(value, SPRING);
  const shown = useTransform(spring, (v) => Math.round(v));
  useEffect(() => {
    if (reduced) spring.jump(value);
    else spring.set(value);
  }, [value, reduced, spring]);
  return <m.span>{shown}</m.span>;
}

/**
 * Jauge ensō des chances : anneau vermillon pour la réussite, anneau d'or intérieur pour le triomphe.
 * Le chiffre central défile quand une carte rejoint ou quitte l'équipe.
 */
export function SuccessGauge({ success, triumph, reduced, size = 148 }: { success: number; triumph: number; reduced: boolean; size?: number }) {
  const t = useTranslations("expedition.team");
  return (
    <div
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={success}
      aria-label={t("gaugeLabel", { success, triumph })}
      className="relative shrink-0"
      style={{ width: size, height: size }}
    >
      <span aria-hidden="true" className="absolute inset-0 rounded-full border-[7px] border-border/70" />
      <Arc value={success / 100} className="border-shu" inset={0} reduced={reduced} />
      <span aria-hidden="true" className="absolute rounded-full border-[3px] border-border/40" style={{ inset: 13 }} />
      <Arc value={triumph / 100} className="border-kin !border-[3px]" inset={13} reduced={reduced} />
      <span aria-hidden="true" className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-heading text-4xl leading-none tabular-nums">
          <Rolling value={success} reduced={reduced} />
          <span className="text-xl">%</span>
        </span>
        <span className="mt-1 text-[11px] font-bold tracking-wide text-text-muted uppercase">{t("chance")}</span>
        <span className={`mt-0.5 text-xs font-bold tabular-nums text-kin transition-opacity duration-300 ${triumph > 0 ? "opacity-100" : "opacity-0"}`}>
          {t("triumphShort", { value: triumph })}
        </span>
      </span>
    </div>
  );
}
