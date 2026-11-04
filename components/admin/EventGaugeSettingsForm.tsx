"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { changedSettingKeys } from "@/lib/settings/form";
import { EVENT_GAUGE_SETTING_KEYS, eventGaugeSettingsSchema, type EventGaugeSettings } from "@/lib/settings/event-gauge-form";
import { updateEventGaugeSettings } from "@/server/actions/admin-settings";
import { Field, inputClass, NumberField, Toggle } from "./fields";
import { SettingsSaveBar } from "./SettingsSaveBar";

/** Date ISO → valeur d'un champ datetime-local (heure locale du navigateur de l'admin). */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type NumberKey = "home.eventGauge.goal" | "home.eventGauge.refreshSeconds" | "home.eventGauge.cacheSeconds";
type DateKey = "home.eventGauge.startsAt" | "home.eventGauge.endsAt";

const LIMITS: Record<NumberKey, [number, number]> = {
  "home.eventGauge.goal": [1, 100_000_000],
  "home.eventGauge.refreshSeconds": [5, 600],
  "home.eventGauge.cacheSeconds": [5, 600],
};

type Short<K> = K extends `home.eventGauge.${infer S}` ? S : never;
const short = <K extends keyof EventGaugeSettings>(key: K) => key.slice("home.eventGauge.".length) as Short<K>;

/** Réglages de la jauge communautaire de l'accueil. */
export function EventGaugeSettingsForm({ initial }: { initial: EventGaugeSettings }) {
  const t = useTranslations("admin.eventGauge");
  const [draft, setDraft] = useState(initial);
  const valid = eventGaugeSettingsSchema.safeParse(draft).success;
  const changed = valid ? changedSettingKeys(EVENT_GAUGE_SETTING_KEYS, initial, draft) : [];
  const label = (k: keyof EventGaugeSettings) => t(`keys.${short(k)}`);

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
          label={label("home.eventGauge.enabled")}
          checked={draft["home.eventGauge.enabled"]}
          onChange={(v) => setDraft((d) => ({ ...d, "home.eventGauge.enabled": v }))}
        />
        {date("home.eventGauge.startsAt")}
        {date("home.eventGauge.endsAt")}
        {!valid && <p role="alert" className="text-sm font-bold text-shu">{t("invalid")}</p>}
        {num("home.eventGauge.goal")}
        {num("home.eventGauge.refreshSeconds")}
        {num("home.eventGauge.cacheSeconds")}
      </fieldset>
      <SettingsSaveBar valid={valid} changedLabels={changed.map(label)} save={() => updateEventGaugeSettings(draft)} />
    </form>
  );
}
