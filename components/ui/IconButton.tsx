import type { ButtonHTMLAttributes } from "react";

export type IconButtonTone = "lacquer" | "plain" | "shu";

const tones: Record<IconButtonTone, string> = {
  lacquer: "lacquer text-text hover:border-text-muted/50",
  plain: "text-text-muted hover:bg-surface-2 hover:text-text",
  shu: "border border-shu/40 bg-shu/10 text-shu hover:bg-shu/20",
};

/** Bouton rond à icône seule (44 px) ; le libellé accessible est obligatoire. */
export function iconButtonClasses(tone: IconButtonTone = "plain", className = "") {
  return (
    "relative inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-[transform,background-color,color] duration-150 " +
    `active:scale-[.94] motion-reduce:transition-none ${tones[tone]} ${className}`
  );
}

export function IconButton({
  tone = "plain",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { "aria-label": string; tone?: IconButtonTone }) {
  return <button type="button" className={iconButtonClasses(tone, className)} {...props} />;
}

/** Croix de fermeture partagée par les feuilles et menus. */
export function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}
