"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useDeferredValue, useId, useMemo, useState, useTransition, type ReactNode } from "react";
import type { DrawRules } from "@/lib/boosters/draw";
import { boosterChances, mythicsPerDay } from "@/lib/boosters/odds";
import { RARITIES, RARITY_SEAL, type Rarity } from "@/lib/catalog/rarity";
import {
  boosterSettingsSchema,
  changedKeys,
  type BoosterSettingKey,
  type BoosterSettings,
} from "@/lib/settings/booster-form";
import { updateBoosterSettings, type UpdateSettingsResult } from "@/server/actions/admin-settings";
import { usePercent } from "../boosters/format";
import { Button } from "../ui/Button";

type FieldName =
  | "intervalMinutes"
  | "maxStock"
  | "slotFloors"
  | "rates"
  | "pityThreshold"
  | "goldenEvery"
  | "goldenFloor"
  | "divineOdds"
  | "rotationHours"
  | "rotationDemographie"
  | "rotationGenre";
const field = (key: BoosterSettingKey) => key.slice("booster.".length) as FieldName;

const toRules = (s: BoosterSettings): DrawRules => ({
  rates: s["booster.rates"],
  slotFloors: s["booster.slotFloors"],
  pityThreshold: s["booster.pityThreshold"],
  goldenEvery: s["booster.goldenEvery"],
  goldenFloor: s["booster.goldenFloor"],
  divineOdds: s["booster.divineOdds"],
});

function metrics(s: BoosterSettings) {
  const chances = boosterChances(toRules(s));
  return { ...chances, perDay: mythicsPerDay(chances.mythicRate, s["booster.intervalMinutes"]) };
}

const input =
  "min-h-11 w-full min-w-0 rounded-button border border-border bg-surface-2 px-3 text-base tabular-nums aria-invalid:border-shu";

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  hint,
}: {
  label: ReactNode;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  hint?: string;
}) {
  const id = useId();
  const invalid = !Number.isInteger(value) || value < min || value > max;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-sm">
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={Number.isFinite(value) ? value : ""}
        aria-invalid={invalid || undefined}
        onChange={(e) => onChange(e.target.valueAsNumber)}
        className={input}
      />
      {hint && <span className="text-xs text-text-muted">{hint}</span>}
    </div>
  );
}

function RaritySelect({ value, onChange, label }: { value: Rarity; onChange: (r: Rarity) => void; label: string }) {
  const tRarity = useTranslations("rarity");
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value as Rarity)} className={input}>
      {RARITIES.map((r) => (
        <option key={r} value={r}>
          {RARITY_SEAL[r]} {tRarity(r)}
        </option>
      ))}
    </select>
  );
}

function Fieldset({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-4 rounded-lg border border-border bg-surface p-4">
      <legend className="px-1 font-title text-lg font-bold">{legend}</legend>
      {children}
    </fieldset>
  );
}

/**
 * Réglages des boosters : délais, emplacements, taux, pitié, doré, divin. L'aperçu d'impact est
 * calculé exactement (odds.ts) ; l'enregistrement passe par une confirmation, et le serveur
 * revalide tout avec les mêmes schémas Zod.
 */
export function BoosterSettingsForm({ initial }: { initial: BoosterSettings }) {
  const t = useTranslations("admin.boosters");
  const tRarity = useTranslations("rarity");
  const format = useFormatter();
  const percent = usePercent();
  const router = useRouter();
  const [draft, setDraft] = useState<BoosterSettings>(initial);
  const [reviewing, setReviewing] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const set = <K extends BoosterSettingKey>(key: K, value: BoosterSettings[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setReviewing(false);
    setMessage(null);
  };

  const valid = boosterSettingsSchema.safeParse(draft).success;
  const changed = valid ? changedKeys(initial, draft) : [];
  const deferred = useDeferredValue(draft);
  const current = useMemo(() => metrics(initial), [initial]);
  const next = useMemo(
    () => (boosterSettingsSchema.safeParse(deferred).success ? metrics(deferred) : null),
    [deferred],
  );

  const rates = draft["booster.rates"];
  const ratesTotal = RARITIES.reduce((s, r) => s + (Number.isFinite(rates[r]) ? rates[r] : 0), 0);
  const floors = draft["booster.slotFloors"];

  const save = () =>
    startTransition(async () => {
      let res: UpdateSettingsResult;
      try {
        res = await updateBoosterSettings(draft);
      } catch {
        setMessage({ tone: "error", text: t("errors.unexpected") });
        return;
      }
      setReviewing(false);
      if (!res.ok) {
        setMessage({ tone: "error", text: t(`errors.${res.error}`) });
        return;
      }
      setMessage({ tone: "ok", text: t("saved", { count: res.changed.length }) });
      router.refresh();
    });

  const rows: [string, (m: ReturnType<typeof metrics>) => string][] = [
    [t("metrics.epic"), (m) => percent(m.atLeast.EPIC)],
    [t("metrics.legendary"), (m) => percent(m.atLeast.LEGENDARY)],
    [t("metrics.mythic"), (m) => percent(m.atLeast.MYTHIC)],
    [t("metrics.meanGap"), (m) => format.number(m.meanGap, { maximumFractionDigits: 0 })],
    [t("metrics.perDay"), (m) => format.number(m.perDay, { maximumFractionDigits: 2 })],
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <form className="flex min-w-0 flex-col gap-6" onSubmit={(e) => e.preventDefault()}>
        <Fieldset legend={t("stockSection")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField
              label={t("fields.intervalMinutes")}
              value={draft["booster.intervalMinutes"]}
              onChange={(v) => set("booster.intervalMinutes", v)}
              min={1}
              max={1440}
            />
            <NumberField
              label={t("fields.maxStock")}
              value={draft["booster.maxStock"]}
              onChange={(v) => set("booster.maxStock", v)}
              min={1}
              max={100}
            />
          </div>
        </Fieldset>

        <Fieldset legend={t("drawSection")}>
          <div className="flex flex-col gap-2">
            <span className="text-sm">{t("fields.slotFloors")}</span>
            <ol className="flex flex-col gap-2">
              {floors.map((floor, i) => (
                <li key={i} className="grid grid-cols-[4.5rem_minmax(0,1fr)_2.75rem] items-center gap-2">
                  <span className="text-sm text-text-muted">{t("slot", { n: i + 1 })}</span>
                  <RaritySelect
                    label={t("slot", { n: i + 1 })}
                    value={floor}
                    onChange={(r) => set("booster.slotFloors", floors.map((f, j) => (j === i ? r : f)))}
                  />
                  <button
                    type="button"
                    aria-label={t("removeSlot", { n: i + 1 })}
                    disabled={floors.length <= 1}
                    onClick={() => set("booster.slotFloors", floors.filter((_, j) => j !== i))}
                    className="size-11 rounded-button border border-border text-lg disabled:opacity-40"
                  >
                    <span aria-hidden="true">−</span>
                  </button>
                </li>
              ))}
            </ol>
            <Button
              type="button"
              className="self-start"
              disabled={floors.length >= 10}
              onClick={() => set("booster.slotFloors", [...floors, "COMMON"])}
            >
              {t("addSlot")}
            </Button>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm">{t("fields.rates")}</span>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[...RARITIES].reverse().map((r) => (
                <NumberField
                  key={r}
                  label={
                    <>
                      <span aria-hidden="true" lang="ja" className="font-seal">
                        {RARITY_SEAL[r]}
                      </span>{" "}
                      {tRarity(r)}
                    </>
                  }
                  value={rates[r]}
                  onChange={(v) => set("booster.rates", { ...rates, [r]: v })}
                  min={0}
                  max={1_000_000}
                  hint={ratesTotal > 0 && Number.isFinite(rates[r]) ? percent(rates[r] / ratesTotal) : undefined}
                />
              ))}
            </div>
            <span className="text-xs text-text-muted">{t("ratesTotal", { total: ratesTotal })}</span>
          </div>
        </Fieldset>

        <Fieldset legend={t("bonusSection")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField
              label={t("fields.pityThreshold")}
              value={draft["booster.pityThreshold"]}
              onChange={(v) => set("booster.pityThreshold", v)}
              min={1}
              max={10_000}
            />
            <NumberField
              label={t("fields.goldenEvery")}
              value={draft["booster.goldenEvery"]}
              onChange={(v) => set("booster.goldenEvery", v)}
              min={0}
              max={1000}
            />
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-sm">{t("fields.goldenFloor")}</span>
              <RaritySelect
                label={t("fields.goldenFloor")}
                value={draft["booster.goldenFloor"]}
                onChange={(r) => set("booster.goldenFloor", r)}
              />
            </div>
            <NumberField
              label={t("fields.divineOdds")}
              value={draft["booster.divineOdds"]}
              onChange={(v) => set("booster.divineOdds", v)}
              min={0}
              max={1_000_000}
            />
          </div>
        </Fieldset>

        <Fieldset legend={t("rotationSection")}>
          <div className="grid gap-4 sm:grid-cols-3">
            <NumberField
              label={t("fields.rotationHours")}
              value={draft["booster.rotationHours"]}
              onChange={(v) => set("booster.rotationHours", v)}
              min={1}
              max={24 * 7}
            />
            <NumberField
              label={t("fields.rotationDemographie")}
              value={draft["booster.rotationDemographie"]}
              onChange={(v) => set("booster.rotationDemographie", v)}
              min={0}
              max={50}
            />
            <NumberField
              label={t("fields.rotationGenre")}
              value={draft["booster.rotationGenre"]}
              onChange={(v) => set("booster.rotationGenre", v)}
              min={0}
              max={50}
            />
          </div>
        </Fieldset>
      </form>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-20">
        <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
          <h3 className="font-title text-lg font-bold">{t("preview")}</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-text-muted">
                <th scope="col" className="py-1 font-normal">
                  {t("metric")}
                </th>
                <th scope="col" className="py-1 text-right font-normal">
                  {t("current")}
                </th>
                <th scope="col" className="py-1 text-right font-normal">
                  {t("draft")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, value]) => (
                <tr key={label} className="border-t border-border">
                  <th scope="row" className="py-2 pr-2 text-left font-normal">
                    {label}
                  </th>
                  <td className="py-2 text-right tabular-nums text-text-muted">{value(current)}</td>
                  <td className="py-2 text-right font-bold tabular-nums">{next ? value(next) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {!valid && (
          <p role="alert" className="text-sm text-shu">
            {t("invalid")}
          </p>
        )}

        {reviewing && valid && changed.length > 0 ? (
          <section className="flex flex-col gap-3 rounded-lg border border-shu bg-surface p-4" aria-live="polite">
            <h3 className="font-bold">{t("confirmTitle")}</h3>
            <ul className="list-inside list-disc text-sm">
              {changed.map((k) => (
                <li key={k}>{t(`fields.${field(k)}`)}</li>
              ))}
            </ul>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" onClick={() => setReviewing(false)} disabled={pending}>
                {t("cancel")}
              </Button>
              <Button type="button" variant="shu" onClick={save} disabled={pending}>
                {t("confirm")}
              </Button>
            </div>
          </section>
        ) : (
          <Button
            type="button"
            variant="shu"
            disabled={!valid || pending}
            onClick={() => {
              if (changed.length === 0) setMessage({ tone: "ok", text: t("noChange") });
              else setReviewing(true);
            }}
          >
            {t("review")}
          </Button>
        )}

        {message && (
          <p role="status" className={`text-sm ${message.tone === "ok" ? "text-text-muted" : "text-shu"}`}>
            {message.text}
          </p>
        )}
      </aside>
    </div>
  );
}
