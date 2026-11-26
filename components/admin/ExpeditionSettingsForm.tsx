"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import type { CardBonus } from "@/lib/expedition/types";
import { EXPEDITION_SETTING_KEYS, expeditionSettingsSchema, type ExpeditionSettings } from "@/lib/settings/expedition-form";
import { changedSettingKeys, numberBounds } from "@/lib/settings/form";
import { updateExpeditionSettings } from "@/server/actions/admin-settings";
import { NumberField, Toggle } from "./fields";
import { SettingsSaveBar } from "./SettingsSaveBar";

type NumberKey = "expedition.offersPerDay" | "expedition.abandonCooldownHours" | "expedition.triumphRewardPct" | "expedition.failRewardPct";

const BONUS_KEYS = ["below2", "below1", "same", "above1", "above2", "above3"] as const satisfies readonly (keyof CardBonus)[];

type Short<K> = K extends `expedition.${infer S}` ? S : never;
const short = <K extends keyof ExpeditionSettings>(key: K) => key.slice("expedition.".length) as Short<K>;

/** Réglages des expéditions : interrupteur, offres, attente après abandon, barème des cartes, triomphe et échec. */
export function ExpeditionSettingsForm({ initial }: { initial: ExpeditionSettings }) {
  const t = useTranslations("admin.expeditions");
  const [draft, setDraft] = useState(initial);
  const valid = expeditionSettingsSchema.safeParse(draft).success;
  const changed = valid ? changedSettingKeys(EXPEDITION_SETTING_KEYS, initial, draft) : [];
  const label = (k: keyof ExpeditionSettings) => t(`keys.${short(k)}`);
  const bonus = draft["expedition.cardBonus"];

  const num = (key: NumberKey) => {
    // Bornes lues dans le schéma du réglage (defaults.ts), jamais recopiées
    const [min, max] = numberBounds(key);
    return (
      <NumberField
        key={key}
        label={label(key)}
        hint={t(`hints.${short(key)}`)}
        value={draft[key]}
        min={min}
        max={max}
        onChange={(v) => setDraft((d) => ({ ...d, [key]: v }))}
      />
    );
  };

  return (
    <form className="flex max-w-2xl flex-col gap-6" onSubmit={(e) => e.preventDefault()}>
      <fieldset className="flex min-w-0 flex-col gap-4 lacquer rounded-card p-4">
        <legend className="px-1 font-title text-lg font-bold">{t("settingsSection")}</legend>
        <Toggle label={label("expedition.enabled")} checked={draft["expedition.enabled"]} onChange={(v) => setDraft((d) => ({ ...d, "expedition.enabled": v }))} />
        <p className="-mt-2 text-xs text-text-muted">{t("hints.enabled")}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {num("expedition.offersPerDay")}
          {num("expedition.abandonCooldownHours")}
          {num("expedition.triumphRewardPct")}
          {num("expedition.failRewardPct")}
        </div>
      </fieldset>
      <fieldset className="flex min-w-0 flex-col gap-4 lacquer rounded-card p-4">
        <legend className="px-1 font-title text-lg font-bold">{label("expedition.cardBonus")}</legend>
        <p className="text-xs text-text-muted">{t("hints.cardBonus")}</p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {BONUS_KEYS.map((k) => (
            <NumberField
              key={k}
              label={t(`bonus.${k}`)}
              value={bonus[k]}
              min={0}
              max={100}
              onChange={(v) => setDraft((d) => ({ ...d, "expedition.cardBonus": { ...d["expedition.cardBonus"], [k]: v } }))}
            />
          ))}
        </div>
      </fieldset>
      <SettingsSaveBar valid={valid} changedLabels={changed.map(label)} save={() => updateExpeditionSettings(draft)} />
    </form>
  );
}
