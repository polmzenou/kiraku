"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { changedSettingKeys } from "@/lib/settings/form";
import { FEATURE_SETTING_KEYS, featureSettingsSchema, type FeatureSettings } from "@/lib/settings/features-form";
import { updateFeatureSettings } from "@/server/actions/admin-settings";
import { SettingsSaveBar } from "./SettingsSaveBar";

/** Tous les interrupteurs de fonctionnalités sur une page, avec la relecture avant d'enregistrer. */
export function FeatureSettingsForm({ initial, premiumReady }: { initial: FeatureSettings; premiumReady: boolean }) {
  const t = useTranslations("admin.features");
  const [draft, setDraft] = useState(initial);
  const valid = featureSettingsSchema.safeParse(draft).success;
  const changed = valid ? changedSettingKeys(FEATURE_SETTING_KEYS, initial, draft) : [];

  return (
    <form className="flex max-w-2xl flex-col gap-6" onSubmit={(e) => e.preventDefault()}>
      <ul className="flex flex-col divide-y divide-border lacquer rounded-card">
        {FEATURE_SETTING_KEYS.map((key) => (
          <li key={key}>
            <label className="flex min-h-14 items-center justify-between gap-4 px-4 py-2">
              <span className="flex flex-col">
                <span className="font-bold">{t(`keys.${key}`)}</span>
                <span className="text-xs text-text-muted">
                  {key === "shop.premiumEnabled" && !premiumReady ? t("premiumInert") : t(`help.${key}`)}
                </span>
              </span>
              <input
                type="checkbox"
                checked={draft[key]}
                onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.checked }))}
                role="switch"
                className="switch"
              />
            </label>
          </li>
        ))}
      </ul>
      <SettingsSaveBar valid={valid} changedLabels={changed.map((k) => t(`keys.${k}`))} save={() => updateFeatureSettings(draft)} />
    </form>
  );
}
