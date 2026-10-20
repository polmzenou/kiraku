import type { HTMLAttributes } from "react";

export type BadgeTone = "shu" | "kin" | "ai" | "muted";

const tones: Record<BadgeTone, string> = {
  shu: "bg-shu-btn text-washi-paper",
  kin: "bg-kin text-sumi",
  ai: "bg-ai/15 text-ai",
  muted: "bg-surface-2 text-text-muted",
};

/** Pastille de compteur ou étiquette courte (« Bientôt », « Complet »). */
export function badgeClasses(tone: BadgeTone = "shu", className = "") {
  return `inline-flex min-h-5 min-w-5 items-center justify-center rounded-pill px-1.5 text-[11px] font-bold leading-none tabular-nums ${tones[tone]} ${className}`;
}

export function Badge({ tone = "shu", className = "", ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return <span className={badgeClasses(tone, className)} {...props} />;
}
