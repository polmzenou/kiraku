"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { changedSettingKeys } from "@/lib/settings/form";
import { WRAPPED_SETTING_KEYS, wrappedSettingsSchema, type WrappedSettings } from "@/lib/settings/wrapped-form";
import { updateWrappedSettings } from "@/server/actions/admin-settings";
import { Field, inputClass, NumberField, Toggle } from "./fields";
import { SettingsSaveBar } from "./SettingsSaveBar";

/** Date ISO → valeur d'un champ datetime-local (heure locale du navigateur de l'admin). */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type DateKey = "wrapped.opensAt" | "wrapped.closesAt";
const short = (key: keyof WrappedSettings) => key.slice("wrapped.".length) as "enabled" | "year" | "opensAt" | "closesAt";

/** Wrapped de l'année : interrupteur, année racontée et période d'ouverture. */
export function WrappedSettingsForm({ initial }: { initial: WrappedSettings }) {
  const t = useTranslations("admin.wrapped");
  const [draft, setDraft] = useState(initial);
  const valid = wrappedSettingsSchema.safeParse(draft).success;
  const changed = valid ? changedSettingKeys(WRAPPED_SETTING_KEYS, initial, draft) : [];
  const label = (k: keyof WrappedSettings) => t(`keys.${short(k)}`);

  const date = (key: DateKey) => (
    <Field key={key} label={label(key)} hint={t("hints.date")}>
      {(id) => (
        <input
          id={id}
          type="datetime-local"
          value={toLocalInput(draft[key])}
          // Champ vidé : on garde la dernière date, ces deux réglages sont obligatoires
          onChange={(e) => {
            const { value } = e.target;
            if (value) setDraft((d) => ({ ...d, [key]: new Date(value).toISOString() }));
          }}
          className={inputClass}
        />
      )}
    </Field>
  );

  return (
    <form className="flex max-w-2xl flex-col gap-6" onSubmit={(e) => e.preventDefault()}>
      <fieldset className="flex min-w-0 flex-col gap-4 lacquer rounded-card p-4">
        <legend className="px-1 font-title text-lg font-bold">{t("settingsSection")}</legend>
        <Toggle label={label("wrapped.enabled")} checked={draft["wrapped.enabled"]} onChange={(v) => setDraft((d) => ({ ...d, "wrapped.enabled": v }))} />
        <NumberField
          label={label("wrapped.year")}
          hint={t("hints.year")}
          value={draft["wrapped.year"]}
          min={2025}
          max={2100}
          onChange={(v) => setDraft((d) => ({ ...d, "wrapped.year": v }))}
        />
        {date("wrapped.opensAt")}
        {date("wrapped.closesAt")}
        {!valid && <p role="alert" className="text-sm font-bold text-shu">{t("invalid")}</p>}
      </fieldset>
      <SettingsSaveBar valid={valid} changedLabels={changed.map(label)} save={() => updateWrappedSettings(draft)} />
    </form>
  );
}
