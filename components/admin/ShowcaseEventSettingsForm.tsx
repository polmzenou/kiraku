"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { changedSettingKeys } from "@/lib/settings/form";
import { SHOWCASE_EVENT_SETTING_KEYS, showcaseEventSettingsSchema, type ShowcaseEventSettings } from "@/lib/settings/showcase-event-form";
import { updateShowcaseEventSettings } from "@/server/actions/admin-settings";
import { Field, inputClass, NumberField, TextField, Toggle } from "./fields";
import { SettingsSaveBar } from "./SettingsSaveBar";

/** Date ISO → valeur d'un champ datetime-local (heure locale du navigateur de l'admin). */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type NumberKey = "event.showcase.minCards" | "event.showcase.pageSize";
type DateKey = "event.showcase.startsAt" | "event.showcase.endsAt";

const LIMITS: Record<NumberKey, [number, number]> = {
  "event.showcase.minCards": [1, 20],
  "event.showcase.pageSize": [4, 30],
};

type Short<K> = K extends `event.showcase.${infer S}` ? S : never;
const short = <K extends keyof ShowcaseEventSettings>(key: K) => key.slice("event.showcase.".length) as Short<K>;

/** Réglages de l'event vitrines : visibilité, édition, fenêtre, minimum de cartes et taille des pages. */
export function ShowcaseEventSettingsForm({ initial }: { initial: ShowcaseEventSettings }) {
  const t = useTranslations("admin.showcaseEvent");
  const [draft, setDraft] = useState(initial);
  const valid = showcaseEventSettingsSchema.safeParse(draft).success;
  const changed = valid ? changedSettingKeys(SHOWCASE_EVENT_SETTING_KEYS, initial, draft) : [];
  const label = (k: keyof ShowcaseEventSettings) => t(`keys.${short(k)}`);

  const num = (key: NumberKey) => (
    <NumberField
      key={key}
      label={label(key)}
      hint={t(`hints.${short(key)}`)}
      value={draft[key]}
      min={LIMITS[key][0]}
      max={LIMITS[key][1]}
      onChange={(v) => setDraft((d) => ({ ...d, [key]: v }))}
    />
  );

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
        <Toggle
          label={label("event.showcase.enabled")}
          checked={draft["event.showcase.enabled"]}
          onChange={(v) => setDraft((d) => ({ ...d, "event.showcase.enabled": v }))}
        />
        <p className="-mt-2 text-xs text-text-muted">{t("hints.enabled")}</p>
        <TextField
          label={label("event.showcase.edition")}
          hint={t("hints.edition")}
          value={draft["event.showcase.edition"]}
          maxLength={40}
          invalid={!/^[a-z0-9-]{1,40}$/.test(draft["event.showcase.edition"])}
          onChange={(v) => setDraft((d) => ({ ...d, "event.showcase.edition": v.trim().toLowerCase() }))}
        />
        {date("event.showcase.startsAt")}
        {date("event.showcase.endsAt")}
        {!valid && <p role="alert" className="text-sm font-bold text-shu">{t("invalid")}</p>}
        {num("event.showcase.minCards")}
        {num("event.showcase.pageSize")}
      </fieldset>
      <SettingsSaveBar valid={valid} changedLabels={changed.map(label)} save={() => updateShowcaseEventSettings(draft)} />
    </form>
  );
}
