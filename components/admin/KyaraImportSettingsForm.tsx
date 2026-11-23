"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { KYARA_BASE_RARITY, KYARA_CODES } from "@/lib/kyara/codes";
import { changedSettingKeys } from "@/lib/settings/form";
import { KYARA_FORM_KEYS, kyaraSettingsSchema, type KyaraSettings } from "@/lib/settings/kyara-form";
import { updateKyaraImportSettings } from "@/server/actions/admin-settings";
import { Button } from "../ui/Button";
import { Field, inputClass, NumberField, toLocalInput, Toggle } from "./fields";
import { SettingsSaveBar } from "./SettingsSaveBar";

type NumberKey = "kyaraImport.windowDays" | "kyaraImport.zeniCap" | "kyaraImport.retentionDays";

// Bornes des champs (les mêmes que les schémas Zod de lib/settings/defaults.ts)
const LIMITS: Record<NumberKey, [number, number]> = {
  "kyaraImport.windowDays": [1, 90],
  "kyaraImport.zeniCap": [0, 10_000_000],
  "kyaraImport.retentionDays": [7, 365],
};

type Short<K> = K extends `kyaraImport.${infer S}` ? S : never;
const short = <K extends keyof KyaraSettings>(key: K) => key.replace(/^kyaraImport\./, "") as Short<K>;

/** Import Kyara : sortie et fenêtre, profil du compte Kiraku sur Kyara, barème des cartes converties, entretien. */
export function KyaraImportSettingsForm({ initial }: { initial: KyaraSettings }) {
  const t = useTranslations("admin.kyara.settings");
  const tRarity = useTranslations("rarity");
  const [draft, setDraft] = useState(initial);
  const valid = kyaraSettingsSchema.safeParse(draft).success;
  const changed = valid ? changedSettingKeys(KYARA_FORM_KEYS, initial, draft) : [];
  const label = (k: keyof KyaraSettings) => t(`keys.${short(k)}`);
  const set = <K extends keyof KyaraSettings>(key: K, value: KyaraSettings[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const num = (key: NumberKey) => (
    <NumberField
      key={key}
      label={label(key)}
      hint={t(`hints.${short(key)}`)}
      value={draft[key]}
      min={LIMITS[key][0]}
      max={LIMITS[key][1]}
      onChange={(v) => set(key, v)}
    />
  );
  const zeni = draft["kyaraImport.zeniByRarity"];

  return (
    <form className="flex max-w-3xl flex-col gap-6" onSubmit={(e) => e.preventDefault()}>
      <fieldset className="flex min-w-0 flex-col gap-4 lacquer rounded-card p-4">
        <legend className="px-1 font-title text-lg font-bold">{t("launchSection")}</legend>
        <Toggle label={label("kyaraImport.enabled")} checked={draft["kyaraImport.enabled"]} onChange={(v) => set("kyaraImport.enabled", v)} />
        <Field label={label("kyaraImport.launchAt")} hint={t("hints.launchAt")}>
          {(id) => (
            <input
              id={id}
              type="datetime-local"
              value={toLocalInput(draft["kyaraImport.launchAt"])}
              onChange={(e) => set("kyaraImport.launchAt", e.target.value ? new Date(e.target.value).toISOString() : null)}
              className={inputClass}
            />
          )}
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => set("kyaraImport.launchAt", new Date().toISOString())}>
            {t("launchNow")}
          </Button>
          <Button type="button" onClick={() => set("kyaraImport.launchAt", null)} disabled={draft["kyaraImport.launchAt"] === null}>
            {t("clearDate")}
          </Button>
        </div>
        {num("kyaraImport.windowDays")}
        <Field label={label("kyaraImport.staffProfileUrl")} hint={t("hints.staffProfileUrl")}>
          {(id) => (
            <input
              id={id}
              type="url"
              inputMode="url"
              autoComplete="off"
              placeholder="https://kyara.games/profil/…"
              value={draft["kyaraImport.staffProfileUrl"] ?? ""}
              onChange={(e) => set("kyaraImport.staffProfileUrl", e.target.value.trim() === "" ? null : e.target.value.trim())}
              className={inputClass}
            />
          )}
        </Field>
      </fieldset>

      <fieldset className="flex min-w-0 flex-col gap-4 lacquer rounded-card p-4">
        <legend className="px-1 font-title text-lg font-bold">{t("zeniSection")}</legend>
        <p className="text-xs text-text-muted">{t("hints.zeniByRarity")}</p>
        <div className="grid gap-4 sm:grid-cols-3">
          {KYARA_CODES.map((code) => (
            <NumberField
              key={code}
              label={t("codeLabel", { code, rarity: tRarity(KYARA_BASE_RARITY[code]) })}
              value={zeni[code]}
              min={0}
              max={100_000}
              onChange={(v) => set("kyaraImport.zeniByRarity", { ...zeni, [code]: v })}
            />
          ))}
        </div>
        {num("kyaraImport.zeniCap")}
      </fieldset>

      <fieldset className="flex min-w-0 flex-col gap-4 lacquer rounded-card p-4">
        <legend className="px-1 font-title text-lg font-bold">{t("upkeepSection")}</legend>
        {num("kyaraImport.retentionDays")}
      </fieldset>

      {!valid && (
        <p role="alert" className="text-sm font-bold text-shu">
          {t("invalid")}
        </p>
      )}
      <SettingsSaveBar valid={valid} changedLabels={changed.map(label)} save={() => updateKyaraImportSettings(draft)} />
    </form>
  );
}
