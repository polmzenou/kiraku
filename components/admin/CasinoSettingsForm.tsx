"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { useRarities, useRaritySeals } from "@/lib/catalog/use-rarities";
import { CASINO_FORM_KEYS, casinoSettingsSchema, type CasinoSettings } from "@/lib/settings/casino-form";
import { changedSettingKeys } from "@/lib/settings/form";
import { updateCasinoSettings } from "@/server/actions/admin-settings";
import { Button } from "../ui/Button";
import { Field, inputClass, NumberField, Toggle } from "./fields";
import { SettingsSaveBar } from "./SettingsSaveBar";

/** Date ISO → valeur d'un champ datetime-local (heure locale du navigateur de l'admin). */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type NumberKey = Exclude<
  keyof CasinoSettings,
  "casino.opensAt" | "casino.coinflip.enabled" | "casino.coinflip.allowedRarities" | "casino.coinflip.lastCopyAllowed"
>;

// Bornes des champs (les mêmes que les schémas Zod de lib/settings/defaults.ts)
const LIMITS: Record<NumberKey, [number, number]> = {
  "casino.newBadgeDays": [0, 90],
  "casino.minAccountAgeHours": [0, 24 * 365],
  "casino.coinflip.expiryHours": [1, 24 * 7],
  "casino.coinflip.maxOpenTables": [1, 20],
  "casino.coinflip.dailyLimit": [1, 500],
  "casino.coinflip.lobbyPollSeconds": [5, 120],
  "casino.coinflip.tablePollSeconds": [2, 60],
  "casino.coinflip.feedSize": [4, 50],
  "casino.coinflip.feedMaxAgeHours": [1, 24 * 30],
};

// Réglages accompagnés d'une aide sous le champ
const HINTED: ReadonlySet<NumberKey> = new Set(["casino.newBadgeDays", "casino.coinflip.expiryHours", "casino.coinflip.dailyLimit", "casino.coinflip.feedMaxAgeHours"]);

type Short<K> = K extends `casino.coinflip.${infer S}` ? S : K extends `casino.${infer S}` ? S : never;
const short = <K extends keyof CasinoSettings>(key: K) => key.replace(/^casino\.(coinflip\.)?/, "") as Short<K>;

/** Ouverture du casino (date, badge et cérémonie), garde-fous et règles du pile ou face. */
export function CasinoSettingsForm({ initial }: { initial: CasinoSettings }) {
  const t = useTranslations("admin.casino");
  const tRarity = useTranslations("rarity");
  const rarities = useRarities();
  const seals = useRaritySeals();
  const [draft, setDraft] = useState(initial);
  const valid = casinoSettingsSchema.safeParse(draft).success;
  const changed = valid ? changedSettingKeys(CASINO_FORM_KEYS, initial, draft) : [];
  const label = (k: keyof CasinoSettings) => t(`keys.${short(k)}`);
  const set = <K extends keyof CasinoSettings>(key: K, value: CasinoSettings[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const num = (key: NumberKey) => (
    <NumberField
      key={key}
      label={label(key)}
      hint={HINTED.has(key) ? t(`hints.${short(key)}` as "hints.newBadgeDays") : undefined}
      value={draft[key]}
      min={LIMITS[key][0]}
      max={LIMITS[key][1]}
      onChange={(v) => set(key, v)}
    />
  );
  const allowed = draft["casino.coinflip.allowedRarities"];

  return (
    <form className="flex max-w-3xl flex-col gap-6" onSubmit={(e) => e.preventDefault()}>
      <fieldset className="flex min-w-0 flex-col gap-4 lacquer rounded-card p-4">
        <legend className="px-1 font-title text-lg font-bold">{t("openingSection")}</legend>
        <Field label={label("casino.opensAt")} hint={t("hints.opensAt")}>
          {(id) => (
            <input
              id={id}
              type="datetime-local"
              value={toLocalInput(draft["casino.opensAt"])}
              onChange={(e) => set("casino.opensAt", e.target.value ? new Date(e.target.value).toISOString() : null)}
              className={inputClass}
            />
          )}
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => set("casino.opensAt", new Date().toISOString())}>
            {t("openNow")}
          </Button>
          <Button type="button" onClick={() => set("casino.opensAt", null)} disabled={draft["casino.opensAt"] === null}>
            {t("clearDate")}
          </Button>
        </div>
        {num("casino.newBadgeDays")}
      </fieldset>

      <fieldset className="flex min-w-0 flex-col gap-4 lacquer rounded-card p-4">
        <legend className="px-1 font-title text-lg font-bold">{t("coinflipSection")}</legend>
        <Toggle label={label("casino.coinflip.enabled")} checked={draft["casino.coinflip.enabled"]} onChange={(v) => set("casino.coinflip.enabled", v)} />
        <Toggle
          label={label("casino.coinflip.lastCopyAllowed")}
          checked={draft["casino.coinflip.lastCopyAllowed"]}
          onChange={(v) => set("casino.coinflip.lastCopyAllowed", v)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          {num("casino.minAccountAgeHours")}
          {num("casino.coinflip.expiryHours")}
          {num("casino.coinflip.maxOpenTables")}
          {num("casino.coinflip.dailyLimit")}
          {num("casino.coinflip.lobbyPollSeconds")}
          {num("casino.coinflip.tablePollSeconds")}
          {num("casino.coinflip.feedSize")}
          {num("casino.coinflip.feedMaxAgeHours")}
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm">{label("casino.coinflip.allowedRarities")}</legend>
          <p className="text-xs text-text-muted">{t("hints.allowedRarities")}</p>
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
            {rarities.map((r) => (
              <label key={r} className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  className="choice"
                  checked={allowed.includes(r)}
                  onChange={(e) =>
                    set("casino.coinflip.allowedRarities", e.target.checked ? rarities.filter((x) => x === r || allowed.includes(x)) : allowed.filter((x) => x !== r))
                  }
                />
                <span aria-hidden="true" lang="ja" className="font-seal">
                  {seals[r]}
                </span>
                {tRarity(r as "COMMON")}
              </label>
            ))}
          </div>
        </fieldset>
        {!valid && (
          <p role="alert" className="text-sm font-bold text-shu">
            {t("invalid")}
          </p>
        )}
      </fieldset>

      <SettingsSaveBar valid={valid} changedLabels={changed.map(label)} save={() => updateCasinoSettings(draft)} />
    </form>
  );
}
