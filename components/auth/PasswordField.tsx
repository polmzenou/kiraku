"use client";

import { useTranslations } from "next-intl";
import { useId, useState, type InputHTMLAttributes } from "react";
import { passwordStrength, type PasswordContext } from "@/lib/auth/password-policy";
import type { FieldErrorCode } from "@/lib/auth/schemas";
import { fieldInputClass } from "./Field";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  name: string;
  label: string;
  hint?: string;
  error?: FieldErrorCode;
  /** Jauge de solidité (nouveau mot de passe) : pseudo et e-mail saisis, pour la juger. */
  meter?: PasswordContext & { minLength: number };
};

const BAR = ["bg-border", "bg-shu", "bg-kin", "bg-ai", "bg-ai"] as const;

/**
 * Mot de passe avec bouton afficher / masquer (zone tactile ≥ 44 px) et, pour un nouveau mot de
 * passe, une jauge de solidité. La jauge n'est qu'une indication : le serveur décide.
 */
export function PasswordField({ label, hint, error, meter, onChange, ...input }: Props) {
  const t = useTranslations("auth");
  const tField = useTranslations("auth.fieldErrors");
  const id = useId();
  const [visible, setVisible] = useState(false);
  const [value, setValue] = useState("");
  const score = meter ? passwordStrength(value, meter, meter.minLength) : 0;
  const describedBy = [hint && `${id}-hint`, meter && `${id}-meter`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`${fieldInputClass} pr-12`}
          onChange={(e) => {
            setValue(e.target.value);
            onChange?.(e);
          }}
          {...input}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? t("password.hide") : t("password.show")}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center rounded-r-button text-text-muted"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
            <circle cx="12" cy="12" r="3" />
            {visible && <path d="M4 4l16 16" />}
          </svg>
        </button>
      </div>
      {meter && (
        <div id={`${id}-meter`} className="flex items-center gap-3" aria-live="polite">
          <div className="flex flex-1 gap-1" aria-hidden="true">
            {[1, 2, 3, 4].map((i) => (
              <span key={i} className={`h-1 flex-1 rounded-full transition-colors motion-reduce:transition-none ${score >= i ? BAR[score] : "bg-border"}`} />
            ))}
          </div>
          {value.length > 0 && <span className="text-xs text-text-muted">{t(`password.strength.${score}`)}</span>}
        </div>
      )}
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm text-shu">
          {tField(error)}
        </p>
      )}
    </div>
  );
}
