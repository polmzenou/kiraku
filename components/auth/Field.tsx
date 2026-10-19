"use client";

import { useTranslations } from "next-intl";
import { useId, type InputHTMLAttributes } from "react";
import type { FieldErrorCode } from "@/lib/auth/schemas";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  name: string;
  label: string;
  hint?: string;
  error?: FieldErrorCode;
};

/** Champ texte des formulaires de compte (aussi utilisé par PasswordField). */
export const fieldInputClass =
  "min-h-12 w-full rounded-control border border-border bg-bg px-3.5 text-base text-text placeholder:text-text-muted/70 " +
  "transition-colors hover:border-text-muted/60 focus:border-ai aria-invalid:border-shu motion-reduce:transition-none";

/** Champ de formulaire : libellé, aide, erreur traduite, zone tactile ≥ 44 px. */
export function Field({ label, hint, error, ...input }: Props) {
  const t = useTranslations("auth.fieldErrors");
  const id = useId();
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy} className={fieldInputClass} {...input} />
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm text-shu">
          {t(error)}
        </p>
      )}
    </div>
  );
}
