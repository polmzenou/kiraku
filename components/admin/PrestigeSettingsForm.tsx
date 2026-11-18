"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { changedSettingKeys } from "@/lib/settings/form";
import { PRESTIGE_SETTING_KEYS, prestigeSettingsSchema, type PrestigeSettings } from "@/lib/settings/prestige-form";
import { updatePrestigeSettings } from "@/server/actions/admin-settings";
import { Button } from "../ui/Button";
import { inputClass } from "../ui/Field";
import { NumberField, Toggle } from "./fields";
import { SettingsSaveBar } from "./SettingsSaveBar";

type NumberKey =
  | "prestige.keepSlots"
  | "prestige.minDaysBetween"
  | "prestige.maxCopies"
  | "prestige.heritageMax"
  | "prestige.consecrateMinOwnCycles"
  | "prestige.zeniCap"
  | "prestige.printing.minPrestige"
  | "prestige.printing.current"
  | "prestige.printing.recycleMultiplier";

const LIMITS: Record<NumberKey, [number, number]> = {
  "prestige.keepSlots": [1, 100],
  "prestige.minDaysBetween": [0, 365],
  "prestige.maxCopies": [1_000, 1_000_000],
  "prestige.heritageMax": [1, 5],
  "prestige.consecrateMinOwnCycles": [0, 5],
  "prestige.zeniCap": [0, 100_000_000],
  "prestige.printing.minPrestige": [1, 100],
  "prestige.printing.current": [1, 999],
  "prestige.printing.recycleMultiplier": [1, 100],
};

type RecordKey = "prestige.requiredPercent" | "prestige.printing.chanceBp" | "prestige.printing.sizes";
const RECORD_LIMITS: Record<RecordKey, [number, number]> = {
  "prestige.requiredPercent": [0, 100],
  "prestige.printing.chanceBp": [0, 10_000],
  "prestige.printing.sizes": [1, 10_000],
};

type Short<K> = K extends `prestige.${infer S}` ? S : never;
const short = <K extends keyof PrestigeSettings>(key: K) => key.slice("prestige.".length) as Short<K>;

/**
 * Réglages du prestige : interrupteur, accès par rareté, héritières, délai et garde de taille, héritage et
 * consécration, barème dégressif des Zeni, éditions gravées (chance et taille par rareté, tirage en cours, sceaux).
 */
export function PrestigeSettingsForm({ initial, rarities }: { initial: PrestigeSettings; rarities: { key: string; name: string }[] }) {
  const t = useTranslations("admin.prestige");
  const [draft, setDraft] = useState(initial);
  const valid = prestigeSettingsSchema.safeParse(draft).success;
  const changed = valid ? changedSettingKeys(PRESTIGE_SETTING_KEYS, initial, draft) : [];
  const name = (k: keyof PrestigeSettings) => t(`keys.${short(k)}`);

  const num = (key: NumberKey) => (
    <NumberField
      key={key}
      label={name(key)}
      hint={t(`hints.${short(key)}`)}
      value={draft[key]}
      min={LIMITS[key][0]}
      max={LIMITS[key][1]}
      onChange={(v) => setDraft((d) => ({ ...d, [key]: v }))}
    />
  );

  /** Une valeur par rareté ; une rareté vide est absente du réglage (ignorée à l'accès, jamais gravée). */
  const byRarity = (key: RecordKey) => (
    <fieldset className="flex min-w-0 flex-col gap-3 lacquer rounded-card p-4">
      <legend className="px-1 font-title text-lg font-bold">{name(key)}</legend>
      <p className="text-xs text-text-muted">{t(`hints.${short(key)}`)}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {rarities.map((r) => {
          const value = draft[key][r.key];
          return (
            <label key={r.key} className="flex min-w-0 flex-col gap-1 text-sm">
              <span className="truncate">{r.name}</span>
              <input
                type="number"
                inputMode="numeric"
                className={inputClass}
                min={RECORD_LIMITS[key][0]}
                max={RECORD_LIMITS[key][1]}
                value={value ?? ""}
                placeholder={t("unset")}
                onChange={(e) =>
                  setDraft((d) => {
                    const next = { ...d[key] };
                    if (e.target.value === "") delete next[r.key];
                    else next[r.key] = Number(e.target.value);
                    return { ...d, [key]: next };
                  })
                }
              />
            </label>
          );
        })}
      </div>
    </fieldset>
  );

  const tiers = draft["prestige.zeniTiers"];
  const setTier = (i: number, field: "upTo" | "pct", v: number) =>
    setDraft((d) => ({ ...d, "prestige.zeniTiers": d["prestige.zeniTiers"].map((x, j) => (j === i ? { ...x, [field]: v } : x)) }));
  const printings = Array.from({ length: draft["prestige.printing.current"] }, (_, i) => String(i + 1));

  return (
    <form className="flex max-w-3xl flex-col gap-6" onSubmit={(e) => e.preventDefault()}>
      <fieldset className="flex min-w-0 flex-col gap-4 lacquer rounded-card p-4">
        <legend className="px-1 font-title text-lg font-bold">{t("rebirthSection")}</legend>
        <Toggle label={name("prestige.enabled")} checked={draft["prestige.enabled"]} onChange={(v) => setDraft((d) => ({ ...d, "prestige.enabled": v }))} />
        <p className="-mt-2 text-xs text-text-muted">{t("hints.enabled")}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {num("prestige.keepSlots")}
          {num("prestige.minDaysBetween")}
          {num("prestige.maxCopies")}
          {num("prestige.heritageMax")}
          {num("prestige.consecrateMinOwnCycles")}
        </div>
      </fieldset>
      {byRarity("prestige.requiredPercent")}
      <fieldset className="flex min-w-0 flex-col gap-3 lacquer rounded-card p-4">
        <legend className="px-1 font-title text-lg font-bold">{name("prestige.zeniTiers")}</legend>
        <p className="text-xs text-text-muted">{t("hints.zeniTiers")}</p>
        {tiers.map((tier, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-3">
            <NumberField label={t("tierUpTo")} value={tier.upTo} min={1} max={100_000_000} onChange={(v) => setTier(i, "upTo", v)} />
            <NumberField label={t("tierPct")} value={tier.pct} min={0} max={100} onChange={(v) => setTier(i, "pct", v)} />
            <Button type="button" size="sm" disabled={tiers.length <= 1} onClick={() => setDraft((d) => ({ ...d, "prestige.zeniTiers": d["prestige.zeniTiers"].filter((_, j) => j !== i) }))}>
              {t("removeTier")}
            </Button>
          </div>
        ))}
        {tiers.length < 5 && (
          <Button
            type="button"
            size="sm"
            className="self-start"
            onClick={() => setDraft((d) => ({ ...d, "prestige.zeniTiers": [...d["prestige.zeniTiers"], { upTo: (d["prestige.zeniTiers"].at(-1)?.upTo ?? 0) + 100_000, pct: 0 }] }))}
          >
            {t("addTier")}
          </Button>
        )}
        {num("prestige.zeniCap")}
      </fieldset>
      <fieldset className="flex min-w-0 flex-col gap-4 lacquer rounded-card p-4">
        <legend className="px-1 font-title text-lg font-bold">{t("printingSection")}</legend>
        <p className="text-xs text-text-muted">{t("hints.printingSection")}</p>
        <div className="grid gap-4 sm:grid-cols-3">
          {num("prestige.printing.minPrestige")}
          {num("prestige.printing.current")}
          {num("prestige.printing.recycleMultiplier")}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {printings.map((p) => (
            <label key={p} className="flex flex-col gap-1 text-sm">
              {t("seal", { printing: p })}
              <input
                className={`${inputClass} font-seal`}
                maxLength={4}
                lang="ja"
                value={draft["prestige.printing.seals"][p] ?? ""}
                onChange={(e) =>
                  setDraft((d) => {
                    const seals = { ...d["prestige.printing.seals"] };
                    if (e.target.value === "") delete seals[p];
                    else seals[p] = e.target.value;
                    return { ...d, "prestige.printing.seals": seals };
                  })
                }
              />
            </label>
          ))}
        </div>
        <p className="text-xs text-text-muted">{t("hints.seals")}</p>
      </fieldset>
      {byRarity("prestige.printing.chanceBp")}
      {byRarity("prestige.printing.sizes")}
      <SettingsSaveBar valid={valid} changedLabels={changed.map(name)} save={() => updatePrestigeSettings(draft)} />
    </form>
  );
}
