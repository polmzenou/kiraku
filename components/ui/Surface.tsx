import type { ElementType, HTMLAttributes } from "react";

export type SurfaceTone = "lacquer" | "plain" | "sunken";
export type SurfaceRadius = "card" | "hero" | "control";

const tones: Record<SurfaceTone, string> = {
  lacquer: "lacquer",
  plain: "border border-border bg-surface",
  sunken: "bg-surface-2",
};

const radii: Record<SurfaceRadius, string> = {
  card: "rounded-card",
  hero: "rounded-hero",
  control: "rounded-control",
};

/** Classes d'une surface Urushi, pour les éléments qui ne peuvent pas passer par <Surface>. */
export function surfaceClasses(tone: SurfaceTone = "lacquer", radius: SurfaceRadius = "card", className = "") {
  return `${tones[tone]} ${radii[radius]} ${className}`;
}

/** Carte laquée (section, article, li…) : remplace les « rounded-lg border bg-surface » répétés. */
export function Surface<T extends ElementType = "div">({
  as,
  tone = "lacquer",
  radius = "card",
  className = "",
  ...props
}: { as?: T; tone?: SurfaceTone; radius?: SurfaceRadius } & HTMLAttributes<HTMLElement> & Record<string, unknown>) {
  const Tag = (as ?? "div") as ElementType;
  return <Tag className={surfaceClasses(tone, radius, className)} {...props} />;
}
