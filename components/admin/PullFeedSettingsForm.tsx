"use client";

import { useRarities } from "@/lib/catalog/use-rarities";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { changedSettingKeys } from "@/lib/settings/form";
import { PULL_FEED_SETTING_KEYS, pullFeedSettingsSchema, type PullFeedSettings } from "@/lib/settings/pull-feed-form";
import { updatePullFeedSettings } from "@/server/actions/admin-settings";
import { NumberField, SelectField, Toggle } from "./fields";
import { SettingsSaveBar } from "./SettingsSaveBar";

type NumberKey = Exclude<keyof PullFeedSettings, "home.pullFeed.enabled" | "home.pullFeed.minRarity">;

const LIMITS: Record<NumberKey, [number, number]> = {
  "home.pullFeed.size": [4, 50],
  "home.pullFeed.maxPerPlayer": [1, 50],
  "home.pullFeed.maxAgeHours": [1, 24 * 30],
  "home.pullFeed.refreshSeconds": [5, 600],
  "home.pullFeed.cacheSeconds": [5, 600],
};

type Short<K> = K extends `home.pullFeed.${infer S}` ? S : never;
const short = <K extends keyof PullFeedSettings>(key: K) => key.slice("home.pullFeed.".length) as Short<K>;

/** Réglages du carrousel « En direct · Gros tirages » de l'accueil. */
export function PullFeedSettingsForm({ initial }: { initial: PullFeedSettings }) {
  const t = useTranslations("admin.pullFeed");
  const tRarity = useTranslations("rarity");
  const rarities = useRarities();
  // Les tirages enregistrés commencent à Épique (NotablePull)
  const pullRarities = rarities.slice(Math.max(0, rarities.indexOf("EPIC")));
  const [draft, setDraft] = useState(initial);
  const valid = pullFeedSettingsSchema.safeParse(draft).success;
  const changed = valid ? changedSettingKeys(PULL_FEED_SETTING_KEYS, initial, draft) : [];
  const label = (k: keyof PullFeedSettings) => t(`keys.${short(k)}`);

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

  return (
    <form className="flex max-w-2xl flex-col gap-6" onSubmit={(e) => e.preventDefault()}>
      <fieldset className="flex min-w-0 flex-col gap-4 lacquer rounded-card p-4">
        <legend className="px-1 font-title text-lg font-bold">{t("settingsSection")}</legend>
        <Toggle
          label={label("home.pullFeed.enabled")}
          checked={draft["home.pullFeed.enabled"]}
          onChange={(v) => setDraft((d) => ({ ...d, "home.pullFeed.enabled": v }))}
        />
        <SelectField
          label={label("home.pullFeed.minRarity")}
          hint={t("hints.minRarity")}
          value={draft["home.pullFeed.minRarity"]}
          options={pullRarities.map((r) => ({ value: r, label: tRarity(r) }))}
          onChange={(v) => setDraft((d) => ({ ...d, "home.pullFeed.minRarity": v }))}
        />
        {num("home.pullFeed.size")}
        {num("home.pullFeed.maxPerPlayer")}
        {num("home.pullFeed.maxAgeHours")}
        {num("home.pullFeed.refreshSeconds")}
        {num("home.pullFeed.cacheSeconds")}
      </fieldset>
      <SettingsSaveBar valid={valid} changedLabels={changed.map(label)} save={() => updatePullFeedSettings(draft)} />
    </form>
  );
}
