"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { changedSettingKeys } from "@/lib/settings/form";
import { MAX_REFERRAL_MILESTONES } from "@/lib/settings/defaults";
import { ECONOMY_SETTING_KEYS, economySettingsSchema, type EconomySettings } from "@/lib/settings/economy-form";
import { updateEconomySettings } from "@/server/actions/admin-settings";
import { Button } from "../ui/Button";
import { FormMessage, NumberField, SelectField, Toggle } from "./fields";

/** Interrupteurs des missions et de la boutique, règles anti-fraude et lots du parrainage. */
export function EconomySettingsForm({ initial, lots }: { initial: EconomySettings; lots: { id: string; name: string }[] }) {
  const t = useTranslations("admin.economy");
  const router = useRouter();
  const [draft, setDraft] = useState(initial);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const valid = economySettingsSchema.safeParse(draft).success;
  const changed = valid ? changedSettingKeys(ECONOMY_SETTING_KEYS, initial, draft) : [];
  const update = <K extends keyof EconomySettings>(key: K, value: EconomySettings[K]) => {
    setDraft({ ...draft, [key]: value });
    setMessage(null);
  };
  const lotOptions = [{ value: "", label: t("noLot") }, ...lots.map((l) => ({ value: l.id, label: l.name }))];

  // Paliers : seuils croissants (vérifiés par le schéma), un lot obligatoire par palier
  type Milestones = EconomySettings["referral.milestones"];
  const milestones = draft["referral.milestones"];
  const milestoneLotOptions = lots.map((l) => ({ value: l.id, label: l.name }));
  const setMilestones = (next: Milestones) => update("referral.milestones", next);
  const setMilestone = (i: number, m: Milestones[number]) => setMilestones(milestones.map((x, j) => (j === i ? m : x)));
  const removeMilestone = (i: number) => setMilestones(milestones.filter((_, j) => j !== i));
  const addMilestone = () =>
    setMilestones([...milestones, { referrals: (milestones.at(-1)?.referrals ?? 0) + 5, lotId: lots[0].id }]);

  const save = () =>
    startTransition(async () => {
      try {
        const res = await updateEconomySettings(draft);
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
        <Toggle label={t("keys.missionsEnabled")} checked={draft["missions.enabled"]} onChange={(v) => update("missions.enabled", v)} />
        <Toggle label={t("keys.shopEnabled")} checked={draft["shop.enabled"]} onChange={(v) => update("shop.enabled", v)} />
        <Toggle label={t("keys.premiumEnabled")} checked={draft["shop.premiumEnabled"]} onChange={(v) => update("shop.premiumEnabled", v)} />
        <p className="text-xs text-text-muted">{t("premiumHint")}</p>
      </fieldset>

      <fieldset className="grid gap-4 lacquer rounded-card p-4 sm:grid-cols-2">
        <legend className="px-1 font-bold">{t("referral")}</legend>
        <div className="sm:col-span-2">
          <Toggle label={t("keys.referralEnabled")} checked={draft["referral.enabled"]} onChange={(v) => update("referral.enabled", v)} />
          <Toggle
            label={t("keys.requireVerified")}
            checked={draft["referral.requireVerified"]}
            onChange={(v) => update("referral.requireVerified", v)}
          />
        </div>
        <NumberField
          label={t("keys.attachWindowDays")}
          value={draft["referral.attachWindowDays"]}
          onChange={(v) => update("referral.attachWindowDays", v)}
          min={0}
          max={365}
        />
        <NumberField
          label={t("keys.maxPerMonth")}
          value={draft["referral.maxPerMonth"]}
          onChange={(v) => update("referral.maxPerMonth", v)}
          min={0}
          max={1_000}
        />
        <NumberField
          label={t("keys.minAccountAgeHours")}
          value={draft["referral.minAccountAgeHours"]}
          onChange={(v) => update("referral.minAccountAgeHours", v)}
          min={0}
          max={24 * 365}
        />
        <NumberField
          label={t("keys.minBoostersOpened")}
          value={draft["referral.minBoostersOpened"]}
          onChange={(v) => update("referral.minBoostersOpened", v)}
          min={0}
          max={10_000}
        />
        <SelectField
          label={t("keys.referrerLot")}
          value={draft["referral.referrerLotId"] ?? ""}
          onChange={(v) => update("referral.referrerLotId", v || null)}
          options={lotOptions}
        />
        <SelectField
          label={t("keys.refereeLot")}
          value={draft["referral.refereeLotId"] ?? ""}
          onChange={(v) => update("referral.refereeLotId", v || null)}
          options={lotOptions}
        />
      </fieldset>

      <fieldset className="flex flex-col gap-3 lacquer rounded-card p-4">
        <legend className="px-1 font-bold">{t("keys.milestones")}</legend>
        <p className="text-xs text-text-muted">{t("milestonesHint", { max: MAX_REFERRAL_MILESTONES })}</p>
        {milestones.map((m, i) => (
          <div key={i} className="grid items-end gap-3 sm:grid-cols-[8rem_minmax(0,1fr)_auto]">
            <NumberField
              label={t("keys.milestoneReferrals")}
              value={m.referrals}
              onChange={(v) => setMilestone(i, { ...m, referrals: v })}
              min={1}
              max={1_000}
            />
            <SelectField
              label={t("keys.milestoneLot")}
              value={m.lotId}
              onChange={(v) => setMilestone(i, { ...m, lotId: v })}
              options={milestoneLotOptions}
            />
            <Button type="button" variant="danger" size="sm" onClick={() => removeMilestone(i)}>
              {t("removeMilestone", { count: m.referrals })}
            </Button>
          </div>
        ))}
        {milestones.length < MAX_REFERRAL_MILESTONES && lots.length > 0 && (
          <Button type="button" variant="secondary" size="sm" className="self-start" onClick={addMilestone}>
            {t("addMilestone")}
          </Button>
        )}
      </fieldset>

      <div className="flex flex-col gap-2">
        <Button type="submit" variant="primary" disabled={pending || !valid || changed.length === 0} className="self-start">
          {pending ? t("saving") : t("save")}
        </Button>
        <FormMessage message={message} />
      </div>
    </form>
  );
}
