"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { useRarityDefinitions } from "@/lib/catalog/use-rarities";
import { CONDITION_TYPES, type ConditionType, type ProfileCondition } from "@/lib/profile/conditions";
import { LADDER } from "@/lib/ranked/rules";
import { adminSearchSeriesAction } from "@/server/actions/admin-cosmetics";
import { Field, inputClass, NumberField, SelectField } from "./fields";

/** Valeurs d'une nouvelle condition quand l'admin change de type. */
export function defaultCondition(type: ConditionType, rarity: string): ProfileCondition {
  switch (type) {
    case "ALWAYS":
    case "AMBASSADOR":
      return { type };
    case "RARITY_OWNED":
      return { type, rarity, n: 1 };
    case "SERIES_COMPLETE":
      return { type, seriesId: "" };
    case "RANK_TIER":
      return { type, tier: "GOLD" };
    case "CATALOG_DISCOVERED_PERCENT":
      return { type, n: 50 };
    case "RARITIES_DISCOVERED":
      return { type, rarities: [rarity], n: 1 };
    default:
      return { type, n: 10 };
  }
}

/**
 * Condition de déblocage (titres, cadres, couleurs de pseudo, thèmes de vitrine) : type, nombre,
 * rareté ou raretés, rang, ou série à compléter cherchée par son titre.
 */
export function ConditionFields({
  value: c,
  onChange,
  seriesTitle,
  legend,
}: {
  value: ProfileCondition;
  onChange: (condition: ProfileCondition) => void;
  /** Titre de la série déjà choisie (condition « série complétée »). */
  seriesTitle: string | null;
  /** Titre du bloc, « Condition de déblocage » par défaut. */
  legend?: string;
}) {
  const t = useTranslations("admin.cosmetics");
  const rarities = useRarityDefinitions();
  const [series, setSeries] = useState<{ id: string; title: string }[]>([]);
  const [seriesLabel, setSeriesLabel] = useState(seriesTitle);

  return (
    <fieldset className="flex flex-col gap-3 rounded-control border border-border p-3">
      <legend className="px-1 text-sm font-bold">{legend ?? t("fields.condition")}</legend>
      <SelectField
        label={t("fields.conditionType")}
        value={c.type}
        options={CONDITION_TYPES.map((type) => ({ value: type, label: t(`conditions.${type}`) }))}
        onChange={(type) => onChange(defaultCondition(type, rarities.at(-1)?.key ?? "MYTHIC"))}
      />
      {"n" in c && (
        <NumberField
          label={c.type === "CATALOG_DISCOVERED_PERCENT" ? t("fields.percent") : t("fields.n")}
          value={c.n}
          min={1}
          max={c.type === "CATALOG_DISCOVERED_PERCENT" ? 100 : 1_000_000}
          onChange={(n) => onChange({ ...c, n: n ?? 1 } as ProfileCondition)}
        />
      )}
      {c.type === "RARITIES_DISCOVERED" && (
        <fieldset className="flex flex-col gap-1">
          <legend className="text-sm">{t("fields.rarities")}</legend>
          <div className="flex flex-wrap gap-2">
            {rarities.map((r) => (
              <label key={r.key} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-control border border-border px-3 text-sm has-[:checked]:bg-surface-2 has-[:checked]:font-bold">
                <input
                  type="checkbox"
                  checked={c.rarities.includes(r.key)}
                  onChange={(e) => onChange({ ...c, rarities: e.target.checked ? [...c.rarities, r.key] : c.rarities.filter((k) => k !== r.key) })}
                />
                {r.seal} {r.nameFr}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {c.type === "RARITY_OWNED" && (
        <SelectField
          label={t("fields.rarity")}
          value={c.rarity}
          options={rarities.map((r) => ({ value: r.key, label: `${r.seal} ${r.nameFr}` }))}
          onChange={(rarity) => onChange({ ...c, rarity })}
        />
      )}
      {c.type === "RANK_TIER" && (
        <SelectField label={t("fields.tier")} value={c.tier} options={LADDER.map((tier) => ({ value: tier, label: tier }))} onChange={(tier) => onChange({ ...c, tier })} />
      )}
      {c.type === "SERIES_COMPLETE" && (
        <Field label={t("fields.series")} hint={seriesLabel ? t("hints.seriesChosen", { title: seriesLabel }) : t("hints.series")}>
          {(id) => (
            <div className="flex flex-col gap-2">
              <input
                id={id}
                type="search"
                maxLength={100}
                placeholder={t("seriesPlaceholder")}
                onChange={(e) => {
                  const q = e.target.value.trim();
                  if (q.length >= 2) void adminSearchSeriesAction(q).then(setSeries);
                }}
                className={inputClass}
              />
              {series.length > 0 && (
                <ul className="flex max-h-48 flex-col overflow-y-auto rounded-control border border-border">
                  {series.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        aria-pressed={c.seriesId === s.id}
                        onClick={() => {
                          onChange({ ...c, seriesId: s.id });
                          setSeriesLabel(s.title);
                          setSeries([]);
                        }}
                        className="min-h-11 w-full px-3 text-left text-sm hover:bg-surface-2 aria-pressed:font-bold"
                      >
                        {s.title}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Field>
      )}
    </fieldset>
  );
}
