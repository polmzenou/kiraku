"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { changedSettingKeys } from "@/lib/settings/form";
import { PROFILE_SETTING_KEYS, profileSettingsSchema, type ProfileSettings } from "@/lib/settings/profile-form";
import { updateProfileSettings } from "@/server/actions/admin-settings";
import { Field, inputClass, NumberField } from "./fields";
import { SettingsSaveBar } from "./SettingsSaveBar";

/** Badges dérivés : date limite du badge Pionnier, filleuls requis pour Ambassadeur. */
export function ProfileSettingsForm({ initial }: { initial: ProfileSettings }) {
  const t = useTranslations("admin.cosmetics");
  const [draft, setDraft] = useState(initial);
  const valid = profileSettingsSchema.safeParse(draft).success;
  const changed = valid ? changedSettingKeys(PROFILE_SETTING_KEYS, initial, draft) : [];
  const label = (k: keyof ProfileSettings) => t(`settings.${k === "profile.pioneerUntil" ? "pioneerUntil" : "ambassadorReferrals"}`);

  return (
    <form className="flex max-w-2xl flex-col gap-4 lacquer rounded-card p-4" onSubmit={(e) => e.preventDefault()}>
      <h3 className="font-title text-lg font-bold">{t("badgesTitle")}</h3>
      <Field label={label("profile.pioneerUntil")} hint={t("settings.pioneerHint")}>
        {(id) => (
          <input
            id={id}
            type="date"
            value={draft["profile.pioneerUntil"] ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, "profile.pioneerUntil": e.target.value || null }))}
            className={inputClass}
          />
        )}
      </Field>
      <NumberField
        label={label("profile.ambassadorReferrals")}
        hint={t("settings.ambassadorHint")}
        value={draft["profile.ambassadorReferrals"]}
        min={0}
        max={1_000}
        onChange={(v) => setDraft((d) => ({ ...d, "profile.ambassadorReferrals": v }))}
      />
      <SettingsSaveBar valid={valid} changedLabels={changed.map(label)} save={() => updateProfileSettings(draft)} />
    </form>
  );
}
