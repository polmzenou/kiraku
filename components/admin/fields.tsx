"use client";

import { useId, type ReactNode } from "react";

// Champs communs des formulaires de l'économie dans /admin (zones tactiles ≥ 44 px).

export const inputClass =
  "min-h-11 w-full min-w-0 rounded-button border border-border bg-surface-2 px-3 text-base aria-invalid:border-shu";

export function Field({ label, children, hint }: { label: string; children: (id: string) => ReactNode; hint?: string }) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-sm">
        {label}
      </label>
      {children(id)}
      {hint && <p className="text-xs text-text-muted">{hint}</p>}
    </div>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  hint?: string;
}) {
  const invalid = !Number.isInteger(value) || value < min || value > max;
  return (
    <Field label={label} hint={hint}>
      {(id) => (
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={1}
          value={Number.isFinite(value) ? value : ""}
          aria-invalid={invalid || undefined}
          onChange={(e) => onChange(e.target.valueAsNumber)}
          className={`${inputClass} tabular-nums`}
        />
      )}
    </Field>
  );
}

/** Nombre facultatif : vide = null. */
export function OptionalNumberField({
  label,
  value,
  onChange,
  min,
  max,
  hint,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  min: number;
  max: number;
  hint?: string;
}) {
  const invalid = value !== null && (!Number.isInteger(value) || value < min || value > max);
  return (
    <Field label={label} hint={hint}>
      {(id) => (
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={1}
          value={value === null || !Number.isFinite(value) ? "" : value}
          aria-invalid={invalid || undefined}
          onChange={(e) => onChange(e.target.value === "" ? null : e.target.valueAsNumber)}
          className={`${inputClass} tabular-nums`}
        />
      )}
    </Field>
  );
}

export function TextField({
  label,
  value,
  onChange,
  maxLength,
  hint,
  invalid,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  maxLength: number;
  hint?: string;
  invalid?: boolean;
}) {
  return (
    <Field label={label} hint={hint}>
      {(id) => (
        <input
          id={id}
          value={value}
          maxLength={maxLength}
          aria-invalid={invalid || undefined}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        />
      )}
    </Field>
  );
}

export function SelectField<V extends string>({
  label,
  value,
  onChange,
  options,
  hint,
}: {
  label: string;
  value: V;
  onChange: (v: V) => void;
  options: readonly { value: V; label: string }[];
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      {(id) => (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value as V)} className={inputClass}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-11 items-center gap-3">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-5 accent-shu-btn" />
      <span>{label}</span>
    </label>
  );
}

/** Message de retour d'un formulaire. */
export function FormMessage({ message }: { message: { tone: "ok" | "error"; text: string } | null }) {
  if (!message) return null;
  return (
    <p role={message.tone === "error" ? "alert" : "status"} className={`text-sm ${message.tone === "error" ? "text-shu" : "text-kin"}`}>
      {message.text}
    </p>
  );
}
