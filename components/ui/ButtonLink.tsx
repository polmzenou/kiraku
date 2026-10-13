import type { ComponentProps } from "react";
import { Link } from "@/i18n/navigation";
import { buttonClasses, type ButtonVariant } from "./Button";

/** Lien interne avec l'apparence d'un bouton. */
export function ButtonLink({
  variant = "neutral",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return <Link className={buttonClasses(variant, className)} {...props} />;
}
