"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { frescoOdds } from "@/lib/fresco/odds";
import { changedSettingKeys } from "@/lib/settings/form";
import { FRESCO_SETTING_KEYS, frescoSettingsSchema, type FrescoSettings } from "@/lib/settings/fresco-form";
import { updateFrescoSettings } from "@/server/actions/admin-settings";
import { NumberField, Toggle } from "../fields";
import { SettingsSaveBar } from "../SettingsSaveBar";

/** Chute des fragments : interrupteur, chance par booster (avec les chances qu'elle donne), badge « Nouveau ». */
export function FrescoSettingsForm({ initial, cells, live }: { initial: FrescoSettings; cells: number; live: number }) {
  const t = useTranslations("admin.frescoes.settings");
  const [draft, setDraft] = useState(initial);
  const valid = frescoSettingsSchema.safeParse(draft).success;
  const changed = valid ? changedSettingKeys(FRESCO_SETTING_KEYS, initial, draft) : [];
  const odds = frescoOdds(draft["fresco.enabled"] ? draft["fresco.dropRate"] : 0, cells, Math.max(1, live));

  return (
    <form className="flex max-w-2xl flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
      <fieldset className="flex min-w-0 flex-col gap-4 rounded-card border border-border bg-surface p-4">
        <legend className="px-1 font-title text-lg font-bold">{t("section")}</legend>
        <p className="text-sm text-text-muted">{t("hint")}</p>
        <Toggle label={t("keys.fresco.enabled")} checked={draft["fresco.enabled"]} onChange={(v) => setDraft((d) => ({ ...d, "fresco.enabled": v }))} />
        <NumberField
          label={t("keys.fresco.dropRate")}
          value={draft["fresco.dropRate"]}
          min={0}
          max={10_000}
          onChange={(v) => setDraft((d) => ({ ...d, "fresco.dropRate": v }))}
        />
        <p className="text-sm font-bold text-kin" role="status">
          {odds.oneIn && odds.boostersToComplete ? t("odds", { oneIn: odds.oneIn, boosters: odds.boostersToComplete }) : t("oddsOff")}
        </p>
        <NumberField label={t("keys.fresco.newHours")} value={draft["fresco.newHours"]} min={0} max={720} onChange={(v) => setDraft((d) => ({ ...d, "fresco.newHours": v }))} />
      </fieldset>
      <SettingsSaveBar valid={valid} changedLabels={changed.map((k) => t(`keys.${k}`))} save={() => updateFrescoSettings(draft)} />
    </form>
  );
}
