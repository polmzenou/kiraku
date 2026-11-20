"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { changedSettingKeys } from "@/lib/settings/form";
import { GENERAL_SETTING_KEYS, generalSettingsSchema, type GeneralSettings } from "@/lib/settings/general-form";
import { updateGeneralSettings } from "@/server/actions/admin-settings";
import { Field, inputClass, NumberField, Toggle } from "./fields";
import { SettingsSaveBar } from "./SettingsSaveBar";

type NumberKey = Exclude<keyof GeneralSettings, "game.timeZone" | "multiAccount.followDevice">;

const LIMITS: Record<NumberKey, [number, number]> = {
  "economy.startingZeni": [0, 1_000_000],
  "catalog.newCardHours": [0, 720],
  "guest.createPerHourPerIp": [1, 1_000],
  "guest.retentionDays": [0, 365],
  "account.deletionGraceDays": [0, 365],
  "account.usernameChangeDays": [0, 365],
  "account.exportsPerDay": [1, 50],
  "multiAccount.retentionDays": [1, 365],
  "multiAccount.seenThrottleMinutes": [1, 1_440],
  "multiAccount.sharedIpCap": [2, 100],
  "multiAccount.minScore": [1, 500],
  "multiAccount.autoBanMaxOthers": [0, 5],
  "multiAccount.autoBanDays": [1, 365],
  "multiAccount.autoBanPerDevice": [1, 50],
};

/** Réglages généraux : Zeni de départ, fuseau du jeu, invités, droits du joueur sur ses données, multi-comptes. */
export function GeneralSettingsForm({ initial }: { initial: GeneralSettings }) {
  const t = useTranslations("admin.general");
  const [draft, setDraft] = useState(initial);
  const valid = generalSettingsSchema.safeParse(draft).success;
  const changed = valid ? changedSettingKeys(GENERAL_SETTING_KEYS, initial, draft) : [];
  const label = (k: keyof GeneralSettings) => t(`keys.${k}`);

  const num = (key: NumberKey) => (
    <NumberField
      key={key}
      label={label(key)}
      hint={t(`hints.${key}`)}
      value={draft[key]}
      min={LIMITS[key][0]}
      max={LIMITS[key][1]}
      onChange={(v) => setDraft((d) => ({ ...d, [key]: v }))}
    />
  );

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
        {/* Bans réseau : le ban d'un appareil suit ses nouvelles IP (/admin/multi-comptes/bans) */}
        <div className="flex flex-col gap-1">
          <Toggle
            label={label("multiAccount.followDevice")}
            checked={draft["multiAccount.followDevice"]}
            onChange={(v) => setDraft((d) => ({ ...d, "multiAccount.followDevice": v }))}
          />
          <p className="text-sm text-text-muted">{t("hints.multiAccount.followDevice")}</p>
        </div>
        {num("multiAccount.autoBanMaxOthers")}
        {num("multiAccount.autoBanDays")}
        {num("multiAccount.autoBanPerDevice")}
      </fieldset>
      <SettingsSaveBar valid={valid} changedLabels={changed.map(label)} save={() => updateGeneralSettings(draft)} />
    </form>
  );
}
