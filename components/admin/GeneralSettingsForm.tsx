"use client";

import { useTranslations } from "next-intl";
import { DETECTION_SCORING_FIELDS, detectionScoringSchema, type DetectionScoring } from "@/lib/anticheat/scoring";
import { changedSettingKeys, numberBounds } from "@/lib/settings/form";
import { GENERAL_SETTING_KEYS, generalSettingsSchema, type GeneralSettings } from "@/lib/settings/general-form";
import type { z } from "@/lib/zod";
import { updateGeneralSettings } from "@/server/actions/admin-settings";
import { Field, inputClass, NumberField, Toggle } from "./fields";
import { SettingsSaveBar, useSettingsDraft } from "./SettingsSaveBar";

type NumberKey = Exclude<keyof GeneralSettings, "game.timeZone" | "multiAccount.followDevice" | "multiAccount.followDeviceIpv4" | "multiAccount.scoring">;
type BooleanKey = "multiAccount.followDevice" | "multiAccount.followDeviceIpv4";

/** Bornes d'un champ du barème, lues dans son schéma (lib/anticheat/scoring.ts). */
function scoringBounds(field: keyof DetectionScoring): [number, number] {
  const schema = detectionScoringSchema.shape[field] as unknown as z.ZodNumber;
  return [schema.minValue ?? 0, schema.maxValue ?? 1_000];
}

/** Réglages généraux : Zeni de départ, fuseau du jeu, invités, droits du joueur sur ses données, multi-comptes. */
export function GeneralSettingsForm({ initial }: { initial: GeneralSettings }) {
  const t = useTranslations("admin.general");
  const { draft, base, setDraft, saved } = useSettingsDraft(initial);
  const valid = generalSettingsSchema.safeParse(draft).success;
  const changed = valid ? changedSettingKeys(GENERAL_SETTING_KEYS, base, draft) : [];
  const label = (k: keyof GeneralSettings) => t(`keys.${k}`);

  // Bornes lues dans le schéma de chaque réglage (lib/settings/defaults.ts) : plus de copie qui peut s'en écarter
  const num = (key: NumberKey) => {
    const [min, max] = numberBounds(key);
    return (
      <NumberField
        key={key}
        label={label(key)}
        hint={t(`hints.${key}`)}
        value={draft[key]}
        min={min}
        max={max}
        onChange={(v) => setDraft((d) => ({ ...d, [key]: v }))}
      />
    );
  };

  const toggle = (key: BooleanKey) => (
    <div className="flex flex-col gap-1">
      <Toggle label={label(key)} checked={draft[key]} onChange={(v) => setDraft((d) => ({ ...d, [key]: v }))} />
      <p className="text-sm text-text-muted">{t(`hints.${key}`)}</p>
    </div>
  );

  const scoring = draft["multiAccount.scoring"];
  const scoringField = (field: keyof DetectionScoring) => {
    const [min, max] = scoringBounds(field);
    return (
      <NumberField
        key={field}
        label={t(`scoring.${field}`)}
        value={scoring[field]}
        min={min}
        max={max}
        onChange={(v) => setDraft((d) => ({ ...d, "multiAccount.scoring": { ...d["multiAccount.scoring"], [field]: v } }))}
      />
    );
  };

  return (
    <form className="flex max-w-2xl flex-col gap-6" onSubmit={(e) => e.preventDefault()}>
      <fieldset className="flex min-w-0 flex-col gap-4 lacquer rounded-card p-4">
        <legend className="px-1 font-title text-lg font-bold">{t("gameSection")}</legend>
        {num("economy.startingZeni")}
        <Field label={label("game.timeZone")} hint={t("hints.game.timeZone")}>
          {(id) => (
            <input
              id={id}
              value={draft["game.timeZone"]}
              maxLength={64}
              autoCapitalize="none"
              spellCheck={false}
              onChange={(e) => setDraft((d) => ({ ...d, "game.timeZone": e.target.value.trim() }))}
              className={inputClass}
            />
          )}
        </Field>
        {num("catalog.newCardHours")}
        {num("guest.createPerHourPerIp")}
        {num("guest.retentionDays")}
      </fieldset>
      <fieldset className="flex min-w-0 flex-col gap-4 lacquer rounded-card p-4">
        <legend className="px-1 font-title text-lg font-bold">{t("accountSection")}</legend>
        {num("account.deletionGraceDays")}
        {num("account.usernameChangeDays")}
        {num("account.exportsPerDay")}
      </fieldset>
      <fieldset className="flex min-w-0 flex-col gap-4 lacquer rounded-card p-4">
        <legend className="px-1 font-title text-lg font-bold">{t("multiAccountSection")}</legend>
        {num("multiAccount.retentionDays")}
        {num("multiAccount.seenThrottleMinutes")}
        {num("multiAccount.sharedIpCap")}
        {num("multiAccount.minScore")}
        {/* Barème : poids de chaque indice puis seuils, replié (rarement touché) */}
        <details className="flex flex-col gap-3">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-bold">{label("multiAccount.scoring")}</summary>
          <p className="text-sm text-text-muted">{t("hints.multiAccount.scoring")}</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">{DETECTION_SCORING_FIELDS.map(scoringField)}</div>
        </details>
        {/* Bans réseau : le ban d'un appareil suit ses nouvelles IP (/admin/multi-comptes/bans) */}
        {toggle("multiAccount.followDevice")}
        {toggle("multiAccount.followDeviceIpv4")}
        {num("multiAccount.autoBanMaxOthers")}
        {num("multiAccount.autoBanDays")}
        {num("multiAccount.autoBanPerDevice")}
        {num("multiAccount.ipv4BanDays")}
      </fieldset>
      <SettingsSaveBar valid={valid} changedLabels={changed.map(label)} base={base} draft={draft} saved={saved} save={updateGeneralSettings} />
    </form>
  );
}
