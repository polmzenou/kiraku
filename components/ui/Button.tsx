import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "shu" | "neutral";

const base =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-button px-5 font-medium shadow-paper " +
  "transition-transform active:translate-y-[3px] active:shadow-none disabled:opacity-50 disabled:active:translate-y-0";

const variants: Record<ButtonVariant, string> = {
  shu: "bg-shu-btn text-washi-paper",
  neutral: "border border-border bg-surface-2 text-text",
};

export function buttonClasses(variant: ButtonVariant = "neutral", className = "") {
  return `${base} ${variants[variant]} ${className}`;
}

export function Button({
  variant = "neutral",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button className={buttonClasses(variant, className)} {...props} />;
}
