"use client";

import { useTranslations } from "next-intl";
import { changedSettingKeys } from "@/lib/settings/form";
import { EVENT_GAUGE_SETTING_KEYS, eventGaugeSettingsSchema, type EventGaugeSettings } from "@/lib/settings/event-gauge-form";
import { updateEventGaugeSettings } from "@/server/actions/admin-settings";
import { Link } from "@/i18n/navigation";
import { Field, inputClass, NumberField, SelectField, toLocalInput, Toggle } from "./fields";
import { SettingsSaveBar, useSettingsDraft } from "./SettingsSaveBar";

type NumberKey = "home.eventGauge.goal" | "home.eventGauge.refreshSeconds" | "home.eventGauge.cacheSeconds";
type DateKey = "home.eventGauge.startsAt" | "home.eventGauge.endsAt";

const LIMITS: Record<NumberKey, [number, number]> = {
  "home.eventGauge.goal": [1, 100_000_000],
  "home.eventGauge.refreshSeconds": [5, 600],
  "home.eventGauge.cacheSeconds": [5, 600],
};

type Short<K> = K extends `home.eventGauge.${infer S}` ? S : never;
const short = <K extends keyof EventGaugeSettings>(key: K) => key.slice("home.eventGauge.".length) as Short<K>;

/** Réglages de la jauge communautaire de l'accueil (boosters ou lancers du casino, récompense pour tous). */
export function EventGaugeSettingsForm({
  initial,
  lots,
  reached,
}: {
  initial: EventGaugeSettings;
  /** Lots proposés comme récompense pour tous. */
  lots: { id: string; name: string; active: boolean }[];
  /** Objectif atteint : lien vers l'envoi de la récompense. */
  reached: boolean;
}) {
  const t = useTranslations("admin.eventGauge");
  const { draft, base, setDraft, saved } = useSettingsDraft(initial);
  const valid = eventGaugeSettingsSchema.safeParse(draft).success;
  const changed = valid ? changedSettingKeys(EVENT_GAUGE_SETTING_KEYS, base, draft) : [];
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
        <SelectField
          label={label("home.eventGauge.metric")}
          hint={t("hints.metric")}
          value={draft["home.eventGauge.metric"]}
          options={(["BOOSTERS", "COINFLIPS"] as const).map((m) => ({ value: m, label: t(`metrics.${m}`) }))}
          onChange={(v) => setDraft((d) => ({ ...d, "home.eventGauge.metric": v }))}
        />
        {date("home.eventGauge.startsAt")}
        {date("home.eventGauge.endsAt")}
        {!valid && <p role="alert" className="text-sm font-bold text-shu">{t("invalid")}</p>}
        {num("home.eventGauge.goal")}
        {num("home.eventGauge.refreshSeconds")}
        {num("home.eventGauge.cacheSeconds")}
        <SelectField
          label={label("home.eventGauge.rewardLotId")}
          hint={t("hints.rewardLotId")}
          value={draft["home.eventGauge.rewardLotId"] ?? ""}
          options={[{ value: "", label: t("noReward") }, ...lots.map((l) => ({ value: l.id, label: l.name }))]}
          onChange={(v) => setDraft((d) => ({ ...d, "home.eventGauge.rewardLotId": v === "" ? null : v }))}
        />
        {reached && initial["home.eventGauge.rewardLotId"] && (
          <Link href="/admin/lots" prefetch={false} className="self-start text-sm font-bold text-link underline underline-offset-4">
            {t("sendReward")}
          </Link>
        )}
      </fieldset>
      <SettingsSaveBar valid={valid} changedLabels={changed.map(label)} base={base} draft={draft} saved={saved} save={updateEventGaugeSettings} />
    </form>
  );
}
