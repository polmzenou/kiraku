"use client";

import { useRarities } from "@/lib/catalog/use-rarities";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { changedSettingKeys } from "@/lib/settings/form";
import { GENERAL_SETTING_KEYS, generalSettingsSchema, type GeneralSettings } from "@/lib/settings/general-form";
import { updateGeneralSettings } from "@/server/actions/admin-settings";
import { Field, inputClass, NumberField, SelectField, Toggle } from "./fields";
import { SettingsSaveBar } from "./SettingsSaveBar";

type NumberKey = Exclude<keyof GeneralSettings, "game.timeZone" | "home.pullFeed.enabled" | "home.pullFeed.minRarity">;



const LIMITS: Record<NumberKey, [number, number]> = {
  "economy.startingZeni": [0, 1_000_000],
  "guest.createPerHourPerIp": [1, 1_000],
  "account.deletionGraceDays": [0, 365],
  "account.usernameChangeDays": [0, 365],
  "account.exportsPerDay": [1, 50],
  "home.pullFeed.size": [4, 50],
  "home.pullFeed.maxAgeHours": [1, 24 * 30],
  "home.pullFeed.refreshSeconds": [5, 600],
};

/** Réglages généraux : Zeni de départ, fuseau du jeu, invités, droits du joueur sur ses données. */
export function GeneralSettingsForm({ initial }: { initial: GeneralSettings }) {
  const t = useTranslations("admin.general");
  const tRarity = useTranslations("rarity");
  const rarities = useRarities();
  const PULL_RARITIES = rarities.slice(rarities.indexOf("EPIC"));
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
        {num("guest.createPerHourPerIp")}
      </fieldset>
      <fieldset className="flex min-w-0 flex-col gap-4 lacquer rounded-card p-4">
        <legend className="px-1 font-title text-lg font-bold">{t("accountSection")}</legend>
        {num("account.deletionGraceDays")}
        {num("account.usernameChangeDays")}
        {num("account.exportsPerDay")}
      </fieldset>
      <fieldset className="flex min-w-0 flex-col gap-4 lacquer rounded-card p-4">
        <legend className="px-1 font-title text-lg font-bold">{t("homeSection")}</legend>
        <Toggle
          label={label("home.pullFeed.enabled")}
          checked={draft["home.pullFeed.enabled"]}
          onChange={(v) => setDraft((d) => ({ ...d, "home.pullFeed.enabled": v }))}
        />
        <SelectField
          label={label("home.pullFeed.minRarity")}
          hint={t("hints.home.pullFeed.minRarity")}
          value={draft["home.pullFeed.minRarity"]}
          options={PULL_RARITIES.map((r) => ({ value: r, label: tRarity(r) }))}
          onChange={(v) => setDraft((d) => ({ ...d, "home.pullFeed.minRarity": v }))}
        />
        {num("home.pullFeed.size")}
        {num("home.pullFeed.maxAgeHours")}
        {num("home.pullFeed.refreshSeconds")}
      </fieldset>
      <SettingsSaveBar valid={valid} changedLabels={changed.map(label)} save={() => updateGeneralSettings(draft)} />
    </form>
  );
}
