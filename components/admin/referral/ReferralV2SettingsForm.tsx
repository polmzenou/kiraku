"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { MAX_REFERRAL_V2_MILESTONES } from "@/lib/settings/defaults";
import { changedSettingKeys } from "@/lib/settings/form";
import { REFERRAL_V2_FORM_KEYS, referralV2SettingsSchema, type ReferralV2Settings } from "@/lib/settings/referral-v2-form";
import { updateReferralV2Settings } from "@/server/actions/admin-settings";
import { Button } from "../../ui/Button";
import { Field, inputClass, NumberField, SelectField, Toggle, toLocalInput } from "../fields";
import { SettingsSaveBar } from "../SettingsSaveBar";

type NumberKey =
  | "referral.v2.maxPerMonth"
  | "referral.v2.installHours"
  | "referral.v2.installOpenings"
  | "referral.v2.guestGraceHours"
  | "referral.v2.accroDays"
  | "referral.v2.accroWindowDays"
  | "referral.v2.fideleDays"
  | "referral.v2.fideleWindowDays"
  | "referral.v2.trustDiscordDays"
  | "referral.v2.holdScore"
  | "referral.v2.scoreTtlHours"
  | "referral.v2.cardLockDays"
  | "referral.v2.pairLockDays"
  | "referral.v2.announceDays";

// Bornes des champs (les mêmes que les schémas Zod de lib/settings/defaults.ts)
const LIMITS: Record<NumberKey, [number, number]> = {
  "referral.v2.maxPerMonth": [0, 1_000],
  "referral.v2.installHours": [0, 24 * 30],
  "referral.v2.installOpenings": [1, 10_000],
  "referral.v2.guestGraceHours": [0, 48],
  "referral.v2.accroDays": [1, 90],
  "referral.v2.accroWindowDays": [1, 90],
  "referral.v2.fideleDays": [1, 180],
  "referral.v2.fideleWindowDays": [1, 180],
  "referral.v2.trustDiscordDays": [0, 3_650],
  "referral.v2.holdScore": [1, 1_000],
  "referral.v2.scoreTtlHours": [1, 24 * 30],
  "referral.v2.cardLockDays": [0, 365],
  "referral.v2.pairLockDays": [0, 365],
  "referral.v2.announceDays": [0, 60],
};

type Short<K> = K extends `referral.v2.${infer S}` ? S : never;
const short = <K extends keyof ReferralV2Settings>(key: K) => key.replace(/^referral\.v2\./, "") as Short<K>;

type Milestone = ReferralV2Settings["referral.v2.milestones"][number];
type StepLot = ReferralV2Settings["referral.v2.stepLots"][number];

/**
 * Parrainage v2 : interrupteur et plafond, conditions des étapes, lots des deux côtés à chaque étape (et part
 * « confiance » du parrain aux étapes 1 et 2), grand-parrainage, paliers, contrôles. Toute l'équipe l'enregistre.
 */
export function ReferralV2SettingsForm({ initial, lots }: { initial: ReferralV2Settings; lots: { id: string; name: string }[] }) {
  const t = useTranslations("admin.referralV2.settings");
  const [draft, setDraft] = useState(initial);
  const valid = referralV2SettingsSchema.safeParse(draft).success;
  const changed = valid ? changedSettingKeys(REFERRAL_V2_FORM_KEYS, initial, draft) : [];
  const label = (k: keyof ReferralV2Settings) => t(`keys.${short(k)}`);
  const set = <K extends keyof ReferralV2Settings>(key: K, value: ReferralV2Settings[K]) => setDraft((d) => ({ ...d, [key]: value }));
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
  const lotOptions = [{ value: "", label: t("noLot") }, ...lots.map((l) => ({ value: l.id, label: l.name }))];
  const lotSelect = (text: string, value: string | null, onChange: (id: string | null) => void) => (
    <SelectField label={text} value={value ?? ""} onChange={(v) => onChange(v || null)} options={lotOptions} />
  );

  const steps = draft["referral.v2.stepLots"];
  const setStep = (i: number, patch: Partial<StepLot>) => set("referral.v2.stepLots", steps.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const milestones = draft["referral.v2.milestones"];
  const setMilestone = (i: number, patch: Partial<Milestone>) => set("referral.v2.milestones", milestones.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  const addMilestone = () =>
    set("referral.v2.milestones", [
      ...milestones,
      { installed: (milestones.at(-1)?.installed ?? 0) + 5, lotId: null, choiceVouchers: 0, oneOfOne: false, ambassador: false, legend: false },
    ]);

  return (
    <form className="flex max-w-3xl flex-col gap-6" onSubmit={(e) => e.preventDefault()}>
      <fieldset className="flex min-w-0 flex-col gap-4 lacquer rounded-card p-4">
        <legend className="px-1 font-title text-lg font-bold">{t("launchSection")}</legend>
        <Toggle label={label("referral.v2.enabled")} checked={draft["referral.v2.enabled"]} onChange={(v) => set("referral.v2.enabled", v)} />
        <p className="text-xs text-text-muted">{t("hints.enabled")}</p>
        {num("referral.v2.maxPerMonth")}
        <Field label={label("referral.v2.announceAt")} hint={t("hints.announceAt")}>
          {(id) => (
            <div className="flex flex-wrap gap-2">
              <input
                id={id}
                type="datetime-local"
                value={toLocalInput(draft["referral.v2.announceAt"])}
                onChange={(e) => set("referral.v2.announceAt", e.target.value ? new Date(e.target.value).toISOString() : null)}
                className={`${inputClass} min-w-0 flex-1`}
              />
              <Button type="button" size="sm" className="self-center" onClick={() => set("referral.v2.announceAt", new Date().toISOString())}>
                {t("now")}
              </Button>
            </div>
          )}
        </Field>
        {num("referral.v2.announceDays")}
      </fieldset>

      <fieldset className="flex min-w-0 flex-col gap-4 lacquer rounded-card p-4">
        <legend className="px-1 font-title text-lg font-bold">{t("stepsSection")}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {num("referral.v2.installHours")}
          {num("referral.v2.installOpenings")}
          {num("referral.v2.guestGraceHours")}
          {num("referral.v2.accroDays")}
          {num("referral.v2.accroWindowDays")}
          {num("referral.v2.fideleDays")}
          {num("referral.v2.fideleWindowDays")}
        </div>
      </fieldset>

      <fieldset className="flex min-w-0 flex-col gap-4 lacquer rounded-card p-4">
        <legend className="px-1 font-title text-lg font-bold">{t("lotsSection")}</legend>
        <p className="text-xs text-text-muted">{t("hints.lots")}</p>
        {steps.map((s, i) => (
          <div key={i} className="flex flex-col gap-3 rounded-card border border-border p-3">
            <p className="font-bold">{t("stepTitle", { step: i + 1 })}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {lotSelect(t("referee"), s.referee, (id) => setStep(i, { referee: id }))}
              {lotSelect(t("referrer"), s.referrer, (id) => setStep(i, { referrer: id }))}
              {i < 2 && lotSelect(t("referrerTrust"), s.referrerTrust, (id) => setStep(i, { referrerTrust: id }))}
            </div>
          </div>
        ))}
        {lotSelect(label("referral.v2.grandLotId"), draft["referral.v2.grandLotId"], (id) => set("referral.v2.grandLotId", id))}
      </fieldset>

      <fieldset className="flex min-w-0 flex-col gap-4 lacquer rounded-card p-4">
        <legend className="px-1 font-title text-lg font-bold">{label("referral.v2.milestones")}</legend>
        <p className="text-xs text-text-muted">{t("hints.milestones", { max: MAX_REFERRAL_V2_MILESTONES })}</p>
        {milestones.map((m, i) => (
          <div key={i} className="flex flex-col gap-3 rounded-card border border-border p-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <NumberField label={t("installed")} value={m.installed} min={1} max={10_000} onChange={(v) => setMilestone(i, { installed: v })} />
              {lotSelect(t("lot"), m.lotId, (id) => setMilestone(i, { lotId: id }))}
              <NumberField label={t("choiceVouchers")} value={m.choiceVouchers} min={0} max={20} onChange={(v) => setMilestone(i, { choiceVouchers: v })} />
            </div>
            <div className="flex flex-wrap gap-x-6">
              <Toggle label={t("oneOfOne")} checked={m.oneOfOne} onChange={(v) => setMilestone(i, { oneOfOne: v })} />
              <Toggle label={t("ambassador")} checked={m.ambassador} onChange={(v) => setMilestone(i, { ambassador: v })} />
              <Toggle label={t("legend")} checked={m.legend} onChange={(v) => setMilestone(i, { legend: v })} />
            </div>
            <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => set("referral.v2.milestones", milestones.filter((_, j) => j !== i))}>
              {t("removeMilestone")}
            </Button>
          </div>
        ))}
        <Button type="button" size="sm" className="self-start" disabled={milestones.length >= MAX_REFERRAL_V2_MILESTONES} onClick={addMilestone}>
          {t("addMilestone")}
        </Button>
      </fieldset>

      <fieldset className="flex min-w-0 flex-col gap-4 lacquer rounded-card p-4">
        <legend className="px-1 font-title text-lg font-bold">{t("controlsSection")}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {num("referral.v2.trustDiscordDays")}
          {num("referral.v2.holdScore")}
          {num("referral.v2.scoreTtlHours")}
          {num("referral.v2.cardLockDays")}
          {num("referral.v2.pairLockDays")}
        </div>
      </fieldset>

      {!valid && (
        <p role="alert" className="text-sm font-bold text-shu">
          {t("invalid")}
        </p>
      )}
      <SettingsSaveBar valid={valid} changedLabels={changed.map(label)} save={() => updateReferralV2Settings(draft)} />
    </form>
  );
}
