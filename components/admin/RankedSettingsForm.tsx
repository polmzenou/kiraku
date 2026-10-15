"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LADDER, type TierRow } from "@/lib/ranked/rules";
import { changedSettingKeys } from "@/lib/settings/form";
import { RANKED_FORM_KEYS, rankedSettingsSchema, type RankedSettings } from "@/lib/settings/ranked-form";
import { updateRankedSettings } from "@/server/actions/admin-settings";
import { RankEmblem } from "../ranked/RankEmblem";
import { Button } from "../ui/Button";
import { FormMessage, NumberField, SelectField, Toggle } from "./fields";

// Bornes larges côté champ : le schéma Zod (lib/settings/defaults.ts) tranche à l'enregistrement
const MAX = 100_000;
const ROW_KEYS = ["min", "win", "crushWin", "loss", "crushLoss"] as const;

/** Interrupteur, rangs et barème, Grand Champion, appariement, saisons et lots de fin de saison. */
export function RankedSettingsForm({ initial, lots }: { initial: RankedSettings; lots: { id: string; name: string }[] }) {
  const t = useTranslations("admin.ranked");
  const tRanked = useTranslations("ranked");
  const router = useRouter();
  const [draft, setDraft] = useState(initial);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const valid = rankedSettingsSchema.safeParse(draft).success;
  const changed = valid ? changedSettingKeys(RANKED_FORM_KEYS, initial, draft) : [];
  const set = (next: RankedSettings) => {
    setDraft(next);
    setMessage(null);
  };
  const key = (k: string) => t(`keys.${k}` as "keys.enabled");
  const num = (label: string, value: number, onChange: (v: number) => void) => (
    <NumberField key={label} label={label} value={value} onChange={onChange} min={0} max={MAX} />
  );
  const row = (label: string, value: TierRow, onChange: (v: TierRow) => void, tier: (typeof LADDER)[number] | "GRAND_CHAMPION") => (
    <fieldset key={label} className="flex flex-col gap-3 rounded-lg border border-border bg-surface-2 p-3">
      <legend className="flex items-center gap-2 px-1 font-bold">
        <RankEmblem tier={tier} size={28} />
        {label}
      </legend>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {ROW_KEYS.map((k) => num(key(k), value[k], (v) => onChange({ ...value, [k]: v })))}
      </div>
    </fieldset>
  );
  const lotOptions = [{ value: "", label: t("noLot") }, ...lots.map((l) => ({ value: l.id, label: l.name }))];

  const save = () =>
    startTransition(async () => {
      try {
        const res = await updateRankedSettings(draft);
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

  const box = "grid gap-4 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2";
  const gc = draft["ranked.grandChampion"];
  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <fieldset className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
        <legend className="px-1 font-bold">{t("switches")}</legend>
        <Toggle label={key("enabled")} checked={draft["ranked.enabled"]} onChange={(v) => set({ ...draft, "ranked.enabled": v })} />
      </fieldset>

      <fieldset className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
        <legend className="px-1 font-bold">{t("tiers")}</legend>
        {LADDER.map((tier) =>
          row(tRanked(`tiers.${tier}`), draft["ranked.tiers"][tier], (v) => set({ ...draft, "ranked.tiers": { ...draft["ranked.tiers"], [tier]: v } }), tier),
        )}
        {row(t("grandRow"), gc, (v) => set({ ...draft, "ranked.grandChampion": { ...gc, ...v } }), "GRAND_CHAMPION")}
        <div className="grid gap-4 sm:grid-cols-2">{num(key("top"), gc.top, (v) => set({ ...draft, "ranked.grandChampion": { ...gc, top: v } }))}</div>
      </fieldset>

      <fieldset className={box}>
        <legend className="px-1 font-bold">{t("scale")}</legend>
        {num(key("gapDivisor"), draft["ranked.gapDivisor"], (v) => set({ ...draft, "ranked.gapDivisor": v }))}
        {num(key("gapCapPct"), draft["ranked.gapCapPct"], (v) => set({ ...draft, "ranked.gapCapPct": v }))}
        {num(key("crushHpPct"), draft["ranked.crushHpPct"], (v) => set({ ...draft, "ranked.crushHpPct": v }))}
        {num(key("protectionGames"), draft["ranked.protectionGames"], (v) => set({ ...draft, "ranked.protectionGames": v }))}
        {num(key("botPcPct"), draft["ranked.botPcPct"], (v) => set({ ...draft, "ranked.botPcPct": v }))}
      </fieldset>

      <fieldset className={box}>
        <legend className="px-1 font-bold">{t("matching")}</legend>
        {(["base", "perSecond", "max"] as const).map((k) =>
          num(key(k), draft["ranked.matchRange"][k], (v) => set({ ...draft, "ranked.matchRange": { ...draft["ranked.matchRange"], [k]: v } })),
        )}
      </fieldset>

      <fieldset className={box}>
        <legend className="px-1 font-bold">{t("seasonRules")}</legend>
        {num(key("seasonMonths"), draft["ranked.seasonMonths"], (v) => set({ ...draft, "ranked.seasonMonths": v }))}
        {(["pivot", "keepPct"] as const).map((k) =>
          num(key(k), draft["ranked.reset"][k], (v) => set({ ...draft, "ranked.reset": { ...draft["ranked.reset"], [k]: v } })),
        )}
      </fieldset>

      <fieldset className={box}>
        <legend className="px-1 font-bold">{t("rewardLots")}</legend>
        {([...LADDER, "GRAND_CHAMPION"] as const).map((tier) => (
          <SelectField
            key={tier}
            label={tRanked(`tiers.${tier}`)}
            value={draft["ranked.rewardLots"][tier] ?? ""}
            onChange={(v) => set({ ...draft, "ranked.rewardLots": { ...draft["ranked.rewardLots"], [tier]: v || null } })}
            options={lotOptions}
          />
        ))}
      </fieldset>

      {!valid && <p className="text-sm text-shu">{t("invalid")}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="shu" disabled={pending || !valid || changed.length === 0}>
          {pending ? t("saving") : t("save")}
        </Button>
        <FormMessage message={message} />
      </div>
    </form>
  );
}
