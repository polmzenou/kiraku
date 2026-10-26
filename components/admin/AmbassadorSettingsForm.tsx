"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { changedSettingKeys } from "@/lib/settings/form";
import { AMBASSADOR_SETTING_KEYS, ambassadorSettingsSchema, type AmbassadorSettingKey, type AmbassadorSettings } from "@/lib/settings/ambassador-form";
import { updateAmbassadorSettings } from "@/server/actions/admin-settings";
import { NumberField, SelectField } from "./fields";
import { SettingsSaveBar } from "./SettingsSaveBar";

/** Rôle Ambassadeur : stock de boosters gratuits et pack hebdomadaire (type et nombre). */
export function AmbassadorSettingsForm({ initial, boosterTypes }: { initial: AmbassadorSettings; boosterTypes: { slug: string; name: string }[] }) {
  const t = useTranslations("admin.boosters.ambassador");
  const [draft, setDraft] = useState(initial);
  const valid = ambassadorSettingsSchema.safeParse(draft).success;
  const changed = valid ? changedSettingKeys(AMBASSADOR_SETTING_KEYS, initial, draft) : [];
  const label = (k: AmbassadorSettingKey) => t(`fields.${k.slice("ambassador.".length) as "maxStock" | "weeklyBoosters" | "weeklyBoosterSlug"}`);

  return (
    <form className="flex max-w-2xl flex-col gap-4 lacquer rounded-card p-4" onSubmit={(e) => e.preventDefault()}>
      <h3 className="font-title text-lg font-bold">{t("title")}</h3>
      <p className="text-sm text-text-muted">{t("intro")}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField
          label={label("ambassador.maxStock")}
          value={draft["ambassador.maxStock"]}
          min={1}
          max={100}
          onChange={(v) => setDraft((d) => ({ ...d, "ambassador.maxStock": v }))}
        />
        <NumberField
          label={label("ambassador.weeklyBoosters")}
          hint={t("weeklyHint")}
          value={draft["ambassador.weeklyBoosters"]}
          min={0}
          max={50}
          onChange={(v) => setDraft((d) => ({ ...d, "ambassador.weeklyBoosters": v }))}
        />
        <SelectField
          label={label("ambassador.weeklyBoosterSlug")}
          value={draft["ambassador.weeklyBoosterSlug"]}
          options={boosterTypes.map((b) => ({ value: b.slug, label: b.name }))}
          onChange={(v) => setDraft((d) => ({ ...d, "ambassador.weeklyBoosterSlug": v }))}
        />
      </div>
      <SettingsSaveBar valid={valid} changedLabels={changed.map(label)} save={() => updateAmbassadorSettings(draft)} />
    </form>
  );
}
