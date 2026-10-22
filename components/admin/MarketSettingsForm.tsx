"use client";

import { useTranslations } from "next-intl";
import { useRarities, useRaritySeals } from "@/lib/catalog/use-rarities";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { changedSettingKeys } from "@/lib/settings/form";
import { MARKET_SETTING_KEYS, marketSettingsSchema, parseDurations, type MarketSettings } from "@/lib/settings/market-form";
import { updateMarketSettings } from "@/server/actions/admin-settings";
import { Button } from "../ui/Button";
import { Field, FormMessage, inputClass, NumberField, Toggle } from "./fields";

type NumKey = Exclude<
  keyof MarketSettings,
  "market.enabled" | "market.durationsHours" | "market.maxPriceByRarity" | "listings.enabled" | "listings.allowOther" | "listings.allowedRarities"
>;

// Bornes des champs (les mêmes que les schémas Zod de lib/settings/defaults.ts)
const BOUNDS: Record<NumKey, [number, number]> = {
  "market.feeBp": [0, 5_000],
  "market.minIncrementBp": [0, 10_000],
  "market.antiSnipeSeconds": [0, 3_600],
  "market.extendSeconds": [0, 3_600],
  "market.maxActivePerSeller": [1, 1_000],
  "market.minAccountAgeHours": [0, 24 * 365],
  "market.minStartPrice": [1, 1_000_000],
  "market.maxPrice": [1, 100_000_000],
  "market.pollSeconds": [2, 120],
  "listings.expiryHours": [1, 24 * 30],
  "listings.maxWants": [1, 10],
  "listings.maxActive": [1, 100],
  "listings.perDay": [1, 500],
  "listings.maxPendingOffers": [1, 200],
};

/**
 * Interrupteur, règles des enchères (taxe, surenchère, anti-sniping, durées), limites anti-abus et
 * échanges ouverts (annonces « celle-ci contre l'une de celles-là »).
 */
export function MarketSettingsForm({ initial }: { initial: MarketSettings }) {
  const t = useTranslations("admin.market");
  const tRarity = useTranslations("rarity");
  const rarities = useRarities();
  const seals = useRaritySeals();
  const router = useRouter();
  const [draft, setDraft] = useState(initial);
  const [durations, setDurations] = useState(initial["market.durationsHours"].join(", "));
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const parsedDurations = parseDurations(durations);
  const next = parsedDurations ? { ...draft, "market.durationsHours": parsedDurations } : null;
  const valid = next !== null && marketSettingsSchema.safeParse(next).success;
  const changed = valid ? changedSettingKeys(MARKET_SETTING_KEYS, initial, next) : [];
  const update = <K extends keyof MarketSettings>(key: K, value: MarketSettings[K]) => {
    setDraft({ ...draft, [key]: value });
    setMessage(null);
  };
  const num = (key: NumKey, hint?: string) => (
    <NumberField
      label={t(`keys.${key.replace(/^market\./, "") as "feeBp"}`)}
      value={draft[key]}
      onChange={(v) => update(key, v)}
      min={BOUNDS[key][0]}
      max={BOUNDS[key][1]}
      hint={hint}
    />
  );

  const save = () =>
    startTransition(async () => {
      if (!next) return;
      try {
        const res = await updateMarketSettings(next);
        if (res.ok) {
          setMessage({ tone: "ok", text: t("saved", { count: res.changed.length }) });
          router.refresh();
        } else {
          setMessage({ tone: "error", text: t(`errors.${res.error}`) });
        }
      } catch {
        setMessage({ tone: "error", text: t("errors.unexpected") });
      }
    });

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <fieldset className="flex flex-col gap-2 lacquer rounded-card p-4">
        <legend className="px-1 font-bold">{t("switches")}</legend>
        <Toggle label={t("keys.enabled")} checked={draft["market.enabled"]} onChange={(v) => update("market.enabled", v)} />
      </fieldset>

      <fieldset className="grid gap-4 lacquer rounded-card p-4 sm:grid-cols-2">
        <legend className="px-1 font-bold">{t("rules")}</legend>
        {num("market.feeBp", t("feeHint"))}
        {num("market.minIncrementBp")}
        {num("market.antiSnipeSeconds")}
        {num("market.extendSeconds")}
        <Field label={t("keys.durationsHours")}>
          {(id) => (
            <input
              id={id}
              value={durations}
              inputMode="numeric"
              aria-invalid={parsedDurations === null || undefined}
              onChange={(e) => {
                setDurations(e.target.value);
                setMessage(null);
              }}
              className={inputClass}
            />
          )}
        </Field>
        {num("market.pollSeconds")}
      </fieldset>

      <fieldset className="grid gap-4 lacquer rounded-card p-4 sm:grid-cols-2">
        <legend className="px-1 font-bold">{t("limits")}</legend>
        {num("market.maxActivePerSeller")}
        {num("market.minAccountAgeHours")}
        {num("market.minStartPrice")}
        {num("market.maxPrice")}
      </fieldset>

      <fieldset className="flex flex-col gap-3 lacquer rounded-card p-4">
        <legend className="px-1 font-bold">{t("rarityCaps")}</legend>
        <p className="text-xs text-text-muted">{t("rarityCapsHint")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {rarities.map((r) => {
            const caps = draft["market.maxPriceByRarity"];
            const value = caps[r];
            const invalid = value !== undefined && (!Number.isSafeInteger(value) || value < draft["market.minStartPrice"] || value > BOUNDS["market.maxPrice"][1]);
            return (
              <Field key={r} label={<><span aria-hidden="true" lang="ja" className="font-seal">{seals[r]}</span> {tRarity(r as "COMMON")}</>}>
                {(id) => (
                  <input
                    id={id}
                    type="number"
                    inputMode="numeric"
                    min={draft["market.minStartPrice"]}
                    max={BOUNDS["market.maxPrice"][1]}
                    step={1}
                    value={value ?? ""}
                    placeholder={t("rarityCapNone")}
                    aria-invalid={invalid || undefined}
                    onChange={(e) => {
                      const rest = Object.fromEntries(Object.entries(caps).filter(([k]) => k !== r));
                      update("market.maxPriceByRarity", e.target.value === "" ? rest : { ...rest, [r]: e.target.valueAsNumber });
                    }}
                    className={`${inputClass} tabular-nums`}
                  />
                )}
              </Field>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4 lacquer rounded-card p-4">
        <legend className="px-1 font-bold">{t("listings")}</legend>
        <Toggle label={t("keys.listings.enabled")} checked={draft["listings.enabled"]} onChange={(v) => update("listings.enabled", v)} />
        <Toggle label={t("keys.listings.allowOther")} checked={draft["listings.allowOther"]} onChange={(v) => update("listings.allowOther", v)} />
        <div className="grid gap-4 sm:grid-cols-2">
          {num("listings.expiryHours")}
          {num("listings.maxWants")}
          {num("listings.maxActive")}
          {num("listings.perDay")}
          {num("listings.maxPendingOffers")}
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm">{t("keys.listings.allowedRarities")}</legend>
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
            {rarities.map((r) => {
              const allowed = draft["listings.allowedRarities"];
              return (
                <label key={r} className="flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    className="choice"
                    checked={allowed.includes(r)}
                    onChange={(e) =>
                      update(
                        "listings.allowedRarities",
                        e.target.checked ? rarities.filter((x) => x === r || allowed.includes(x)) : allowed.filter((x) => x !== r),
                      )
                    }
                  />
                  <span aria-hidden="true" lang="ja" className="font-seal">
                    {seals[r]}
                  </span>
                  {tRarity(r as "COMMON")}
                </label>
              );
            })}
          </div>
        </fieldset>
        <p className="text-xs text-text-muted">{t("listingsHint")}</p>
      </fieldset>

      {!valid && <p className="text-sm text-shu">{t("invalid")}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={pending || !valid || changed.length === 0}>
          {pending ? t("saving") : t("save")}
        </Button>
        <FormMessage message={message} />
      </div>
    </form>
  );
}
