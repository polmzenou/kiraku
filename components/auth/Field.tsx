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

/** Champ de formulaire : libellé, aide, erreur traduite, zone tactile ≥ 44 px. */
export function Field({ label, hint, error, ...input }: Props) {
  const t = useTranslations("auth.fieldErrors");
  const id = useId();
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className="min-h-11 rounded-button border border-border bg-surface-2 px-3 text-base text-text aria-invalid:border-shu"
        {...input}
      />
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
