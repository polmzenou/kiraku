"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { luckOf } from "@/lib/ennichi/omikuji";
import { ennichiSchedule, tierKanji } from "@/lib/ennichi/rules";
import { ENNICHI_TITLES, SETTING_SCHEMAS } from "@/lib/settings/defaults";
import { ENNICHI_FORM_KEYS, ennichiSettingsSchema, type EnnichiSettings } from "@/lib/settings/ennichi-form";
import { changedSettingKeys } from "@/lib/settings/form";
import { updateEnnichiSettings } from "@/server/actions/admin-settings";
import { Seal } from "../../ennichi/Seal";
import { Button } from "../../ui/Button";
import { Field, inputClass, NumberField, SelectField, Toggle, toLocalInput } from "../fields";
import { SettingsSaveBar, useSettingsDraft } from "../SettingsSaveBar";

type NumberKey = "ennichi.edition" | "ennichi.days" | "ennichi.closingDays" | "ennichi.stepMultiplier" | "ennichi.tierGrantsPerIp";
type Tier = EnnichiSettings["ennichi.tiers"][number];
type Rank = EnnichiSettings["ennichi.ranks"][number];
type Prize = EnnichiSettings["ennichi.omikuji"][number];

// Bornes des champs (les mêmes que les schémas Zod de lib/settings/defaults.ts)
const LIMITS: Record<NumberKey, [number, number]> = {
  "ennichi.edition": [1, 1_000],
  "ennichi.days": [1, 60],
  "ennichi.closingDays": [0, 14],
  "ennichi.stepMultiplier": [1, 10],
  "ennichi.tierGrantsPerIp": [1, 100],
};
const MAX_RANKS = 12;
const MAX_POOL = 8;

type Short<K> = K extends `ennichi.${infer S}` ? S : never;
const short = <K extends keyof EnnichiSettings>(key: K) => key.replace(/^ennichi\./, "") as Short<K>;

/** Rangs qui se suivent sans trou : chacun commence juste après le précédent, le premier au 1er. */
const chain = (ranks: Rank[]) => ranks.map((r, i) => ({ ...r, from: i === 0 ? 1 : ranks[i - 1].to + 1 }));

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="border-t border-border pt-4 first:border-t-0 first:pt-0">
      <fieldset className="flex min-w-0 flex-col gap-3">
        <legend className="mb-1 text-[11px] font-bold tracking-wide text-text-muted uppercase">{title}</legend>
        {hint && <p className="text-xs text-text-muted">{hint}</p>}
        {children}
      </fieldset>
    </div>
  );
}

/**
 * Réglages de l'Ennichi (carte « Réglages » du tableau de bord) : interrupteur, dates et édition, bonus, paliers de
 * lanternes, prix du banzuke, cagnotte de l'omikuji. Toute l'équipe l'enregistre ; chaque clé changée va au journal.
 */
export function EnnichiSettingsForm({ initial, lots }: { initial: EnnichiSettings; lots: { id: string; name: string }[] }) {
  const t = useTranslations("admin.referralV2.ennichi.settings");
  const format = useFormatter();
  const { draft, base, setDraft, saved } = useSettingsDraft(initial);
  const valid = ennichiSettingsSchema.safeParse(draft).success;
  const changed = valid ? changedSettingKeys(ENNICHI_FORM_KEYS, base, draft) : [];
  const toFix = valid ? [] : ENNICHI_FORM_KEYS.filter((k) => !SETTING_SCHEMAS[k].safeParse(draft[k]).success);
  const label = (k: keyof EnnichiSettings) => t(`keys.${short(k)}`);
  const set = <K extends keyof EnnichiSettings>(key: K, value: EnnichiSettings[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const num = (key: NumberKey, hint?: "edition" | "stepMultiplier" | "tierGrantsPerIp") => (
    <NumberField
      key={key}
      label={label(key)}
      hint={hint ? t(`hints.${hint}`) : undefined}
      value={draft[key]}
      min={LIMITS[key][0]}
      max={LIMITS[key][1]}
      onChange={(v) => set(key, v)}
    />
  );
  const lotOptions = [{ value: "", label: t("noLot") }, ...lots.map((l) => ({ value: l.id, label: l.name }))];
  const lotSelect = (value: string | null, onChange: (id: string | null) => void) => (
    <SelectField label={t("lot")} value={value ?? ""} onChange={(v) => onChange(v || null)} options={lotOptions} />
  );

  const startsAt = draft["ennichi.startsAt"];
  const schedule = ennichiSchedule({ startsAt: startsAt ? new Date(startsAt) : null, days: draft["ennichi.days"], closingDays: draft["ennichi.closingDays"] });
  const when = (d: Date) => format.dateTime(d, { day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });

  const tiers = draft["ennichi.tiers"];
  const setTier = (i: number, patch: Partial<Tier>) => set("ennichi.tiers", tiers.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const ranks = draft["ennichi.ranks"];
  const setRanks = (next: Rank[]) => set("ennichi.ranks", chain(next));
  const setRank = (i: number, patch: Partial<Rank>) => setRanks(ranks.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const addRank = () => {
    const from = (ranks.at(-1)?.to ?? 0) + 1;
    setRanks([...ranks, { from, to: from + 9, title: null, lotId: null, choiceVouchers: 0, oneOfOne: false }]);
  };
  const pool = draft["ennichi.omikuji"];
  const setPool = (i: number, patch: Partial<Prize>) => set("ennichi.omikuji", pool.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const titleOptions = [{ value: "", label: t("noTitle") }, ...ENNICHI_TITLES.map((x) => ({ value: x, label: t(`titles.${x}`) }))];

  return (
    <form className="flex min-w-0 flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
      <Section title={t("datesSection")}>
        <Toggle label={label("ennichi.enabled")} checked={draft["ennichi.enabled"]} onChange={(v) => set("ennichi.enabled", v)} />
        <Field label={label("ennichi.startsAt")} hint={t("hints.startsAt")}>
          {(id) => (
            <input
              id={id}
              type="datetime-local"
              value={toLocalInput(startsAt)}
              onChange={(e) => set("ennichi.startsAt", e.target.value ? new Date(e.target.value).toISOString() : null)}
              className={inputClass}
            />
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          {num("ennichi.days")}
          {num("ennichi.closingDays")}
        </div>
        <p className="text-xs text-text-muted">{schedule ? t("schedule", { end: when(schedule.endsAt), close: when(schedule.closesAt) }) : t("noDate")}</p>
        {num("ennichi.edition", "edition")}
      </Section>

      <Section title={t("bonusSection")}>
        <div className="grid grid-cols-2 gap-3">
          {num("ennichi.stepMultiplier", "stepMultiplier")}
          {num("ennichi.tierGrantsPerIp", "tierGrantsPerIp")}
        </div>
        <Toggle label={label("ennichi.liftCap")} checked={draft["ennichi.liftCap"]} onChange={(v) => set("ennichi.liftCap", v)} />
        <div className="flex flex-col gap-1">
          <Toggle label={label("ennichi.excludeStaff")} checked={draft["ennichi.excludeStaff"]} onChange={(v) => set("ennichi.excludeStaff", v)} />
          <p className="text-xs text-text-muted">{t("hints.excludeStaff")}</p>
        </div>
      </Section>

      <Section title={label("ennichi.tiers")} hint={t("hints.tiers")}>
        {tiers.map((tier, i) => (
          <div key={i} className="flex flex-col gap-3 rounded-control border border-border p-3">
            <div className="flex items-center gap-2">
              <Seal kanji={tierKanji(i)} size={28} />
              <b className="text-sm">{t("tier", { n: i + 1 })}</b>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <NumberField label={t("lanterns")} value={tier.lanterns} min={1} max={1_000_000} onChange={(v) => setTier(i, { lanterns: v })} />
              <NumberField label={t("choiceVouchers")} value={tier.choiceVouchers} min={0} max={20} onChange={(v) => setTier(i, { choiceVouchers: v })} />
            </div>
            {lotSelect(tier.lotId, (id) => setTier(i, { lotId: id }))}
          </div>
        ))}
      </Section>

      <Section title={label("ennichi.ranks")} hint={t("hints.ranks")}>
        {ranks.map((rank, i) => (
          <div key={i} className="flex flex-col gap-3 rounded-control border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <b className="text-sm">{rank.from === rank.to ? t("rankOne", { rank: rank.from }) : t("rankRange", { from: rank.from, to: rank.to })}</b>
              <Button type="button" variant="ghost" size="sm" onClick={() => setRanks(ranks.filter((_, j) => j !== i))}>
                {t("remove")}
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <NumberField label={t("to")} value={rank.to} min={rank.from} max={10_000} onChange={(v) => setRank(i, { to: v })} />
              <SelectField label={t("sumoTitle")} value={rank.title ?? ""} onChange={(v) => setRank(i, { title: (v || null) as Rank["title"] })} options={titleOptions} />
            </div>
            {lotSelect(rank.lotId, (id) => setRank(i, { lotId: id }))}
            <div className="grid grid-cols-2 items-end gap-3">
              <NumberField label={t("choiceVouchers")} value={rank.choiceVouchers} min={0} max={20} onChange={(v) => setRank(i, { choiceVouchers: v })} />
              <Toggle label={t("oneOfOne")} checked={rank.oneOfOne} onChange={(v) => setRank(i, { oneOfOne: v })} />
            </div>
          </div>
        ))}
        <Button type="button" size="sm" className="self-start" disabled={ranks.length >= MAX_RANKS} onClick={addRank}>
          {t("addRank")}
        </Button>
      </Section>

      <Section title={label("ennichi.omikuji")} hint={t("hints.omikuji")}>
        {pool.map((prize, i) => (
          <div key={i} className="flex flex-col gap-3 rounded-control border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <Seal kanji={luckOf(i)} size={28} tone="kin" />
                <b className="text-sm">{t("line", { n: i + 1 })}</b>
              </span>
              <Button type="button" variant="ghost" size="sm" onClick={() => set("ennichi.omikuji", pool.filter((_, j) => j !== i))}>
                {t("remove")}
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <SelectField
                label={t("prizeKind")}
                value={prize.oneOfOne ? "ONE" : "LOT"}
                onChange={(v) => setPool(i, v === "ONE" ? { oneOfOne: true, lotId: null } : { oneOfOne: false })}
                options={[
                  { value: "LOT", label: t("kindLot") },
                  { value: "ONE", label: t("kindOneOfOne") },
                ]}
              />
              <NumberField label={t("count")} value={prize.count} min={0} max={10_000} onChange={(v) => setPool(i, { count: v })} />
            </div>
            {!prize.oneOfOne && lotSelect(prize.lotId, (id) => setPool(i, { lotId: id }))}
          </div>
        ))}
        <Button
          type="button"
          size="sm"
          className="self-start"
          disabled={pool.length >= MAX_POOL}
          onClick={() => set("ennichi.omikuji", [...pool, { lotId: null, oneOfOne: false, count: 1 }])}
        >
          {t("addLine")}
        </Button>
      </Section>

      {toFix.length > 0 && (
        <p role="alert" className="text-sm font-bold text-shu">
          {t("toFix", { list: toFix.map(label).join(", ") })}
        </p>
      )}
      <SettingsSaveBar valid={valid} changedLabels={changed.map(label)} base={base} draft={draft} saved={saved} save={updateEnnichiSettings} />
      <p className="text-xs text-text-muted">{t("savedBy")}</p>
    </form>
  );
}
