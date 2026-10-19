import type { ComponentProps, ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { ButtonContent, buttonClasses, type ButtonSize, type ButtonVariant } from "./Button";

/** Lien interne avec l'apparence d'un bouton. */
export function ButtonLink({
  variant = "secondary",
  size = "md",
  meta,
  className = "",
  children,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize; meta?: ReactNode }) {
  return (
    <Link className={buttonClasses(variant, className, size)} {...props}>
      <ButtonContent meta={meta}>{children}</ButtonContent>
    </Link>
  );
}
