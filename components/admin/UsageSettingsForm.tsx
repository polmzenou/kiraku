"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { changedSettingKeys } from "@/lib/settings/form";
import { USAGE_SETTING_KEYS, usageSettingsSchema, type UsageSettings } from "@/lib/settings/usage-form";
import { updateUsageSettings } from "@/server/actions/admin-settings";
import { NumberField } from "./fields";
import { SettingsSaveBar } from "./SettingsSaveBar";

type Group = "usage.vercelBudget" | "usage.supabaseLimits" | "usage.alertThresholds";

/** Budget mensuel Vercel, limites du plan Supabase, hypothèse d'egress et seuils du bandeau d'alerte. */
export function UsageSettingsForm({ initial }: { initial: UsageSettings }) {
  const t = useTranslations("admin.usage.settings");
  const [draft, setDraft] = useState(initial);
  const valid = usageSettingsSchema.safeParse(draft).success;
  const changed = valid ? changedSettingKeys(USAGE_SETTING_KEYS, initial, draft) : [];

  // Champ d'un réglage objet : { groupe, champ } → libellé et indice traduits
  const field = <G extends Group>(group: G, name: keyof UsageSettings[G] & string, min: number, max: number) => (
    <NumberField
      key={`${group}.${name}`}
      // Clé construite à partir du schéma : chaque champ a son libellé dans admin.usage.settings.fields
      label={t(`fields.${group}.${name}` as Parameters<typeof t>[0])}
      value={draft[group][name] as number}
      min={min}
      max={max}
      onChange={(v) => setDraft((d) => ({ ...d, [group]: { ...d[group], [name]: v } }))}
    />
  );

  return (
    <form className="flex max-w-2xl flex-col gap-6" onSubmit={(e) => e.preventDefault()}>
      <fieldset className="flex min-w-0 flex-col gap-4 lacquer rounded-card p-4">
        <legend className="px-1 font-title text-lg font-bold">{t("alertSection")}</legend>
        <p className="text-sm text-text-muted">{t("alertHint")}</p>
        {field("usage.alertThresholds", "warnPercent", 1, 99)}
        {field("usage.alertThresholds", "criticalPercent", 2, 100)}
      </fieldset>
      <fieldset className="flex min-w-0 flex-col gap-4 lacquer rounded-card p-4">
        <legend className="px-1 font-title text-lg font-bold">{t("supabaseSection")}</legend>
        <p className="text-sm text-text-muted">{t("supabaseHint")}</p>
        {field("usage.supabaseLimits", "dbSizeMb", 1, 10_000_000)}
        {field("usage.supabaseLimits", "egressGb", 1, 1_000_000)}
        {field("usage.supabaseLimits", "storageGb", 1, 1_000_000)}
        {field("usage.supabaseLimits", "poolerClients", 1, 1_000_000)}
        <NumberField
          label={t("fields.usage.egressKbPerInvocation")}
          hint={t("egressKbHint")}
          value={draft["usage.egressKbPerInvocation"]}
          min={0}
          max={10_000}
          onChange={(v) => setDraft((d) => ({ ...d, "usage.egressKbPerInvocation": v }))}
        />
      </fieldset>
      <fieldset className="flex min-w-0 flex-col gap-4 lacquer rounded-card p-4">
        <legend className="px-1 font-title text-lg font-bold">{t("vercelSection")}</legend>
        <p className="text-sm text-text-muted">{t("vercelHint")}</p>
        {field("usage.vercelBudget", "invocations", 1, 1_000_000_000)}
        {field("usage.vercelBudget", "cpuHours", 1, 100_000)}
        {field("usage.vercelBudget", "transferGb", 1, 1_000_000)}
      </fieldset>
      <SettingsSaveBar valid={valid} changedLabels={changed.map((k) => t(`keys.${k}`))} save={() => updateUsageSettings(draft)} />
    </form>
  );
}
