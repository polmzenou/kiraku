import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

// Urushi : boutons en pilule, laque pour le secondaire, pression en transform uniquement.
const base =
  "inline-flex items-center justify-center gap-2 rounded-pill font-bold whitespace-nowrap " +
  "transition-[transform,background-color,border-color,color] duration-150 active:scale-[.97] " +
  "disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:scale-100";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-linear-to-b from-shu to-shu-btn text-washi-paper shadow-shu hover:from-shu hover:to-shu",
  secondary: "lacquer text-text hover:border-text-muted/50",
  ghost: "text-text-muted hover:bg-surface-2 hover:text-text",
  danger: "border border-shu/40 bg-shu/10 text-shu hover:bg-shu/20",
};

const sizes: Record<ButtonSize, string> = {
  // sm : rangées denses ; un pseudo-élément étend la zone tactile à 44 px.
  sm: "relative min-h-9 px-3.5 text-sm after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']",
  md: "min-h-11 px-5 text-sm",
  lg: "min-h-13 px-6 text-base",
};

export function buttonClasses(variant: ButtonVariant = "secondary", className = "", size: ButtonSize = "md") {
  return `${base} ${variants[variant]} ${sizes[size]} ${className}`;
}

/** Contenu scindé « Ouvrir | Gratuit · 3 restants » : l'action, un filet, l'information. */
export function ButtonContent({ children, meta }: { children: ReactNode; meta?: ReactNode }) {
  if (meta === undefined || meta === null || meta === false) return <>{children}</>;
  return (
    <>
      <span>{children}</span>
      <span aria-hidden="true" className="h-4 w-px shrink-0 bg-current opacity-40" />
      <span className="text-xs font-medium opacity-90">{meta}</span>
    </>
  );
}

export function Button({
  variant = "secondary",
  size = "md",
  meta,
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; meta?: ReactNode }) {
  return (
    <button className={buttonClasses(variant, className, size)} {...props}>
      <ButtonContent meta={meta}>{children}</ButtonContent>
    </button>
  );
}
