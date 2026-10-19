"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { TECHNIQUES } from "@/lib/battle/types";
import { RARITIES } from "@/lib/catalog/rarity";
import { COMBAT_SETTING_KEYS, combatSettingsSchema, type CombatSettings } from "@/lib/settings/combat-form";
import { changedSettingKeys } from "@/lib/settings/form";
import { updateCombatSettings } from "@/server/actions/admin-settings";
import { Button } from "../ui/Button";
import { FormMessage, NumberField, Toggle } from "./fields";

// Bornes larges côté champ : le schéma Zod de chaque clé (lib/settings/defaults.ts) tranche à l'enregistrement
const MAX = 100_000;

type Flat = "battle.turnSeconds" | "battle.maxMissedTurns" | "battle.maxTurns" | "battle.firstTurnActions" | "battle.queueSeconds" | "battle.roomMinutes" | "battle.pollSeconds" | "battle.botMistakePct" | "battle.botUpgradePct";
type Group = "battle.stats" | "battle.damage" | "battle.orbs" | "battle.keywordValues" | "battle.rewards" | "battle.keywordsByRarity";

/** Interrupteur, déroulé, stats, dégâts, orbes, passifs, techniques, bot et récompenses du combat. */
export function CombatSettingsForm({ initial }: { initial: CombatSettings }) {
  const t = useTranslations("admin.combat");
  const tRarity = useTranslations("rarity");
  const tBattle = useTranslations("battle");
  const router = useRouter();
  const [draft, setDraft] = useState(initial);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const valid = combatSettingsSchema.safeParse(draft).success;
  const changed = valid ? changedSettingKeys(COMBAT_SETTING_KEYS, initial, draft) : [];
  const set = (next: CombatSettings) => {
    setDraft(next);
    setMessage(null);
  };
  const key = (k: string) => t(`keys.${k}` as "keys.enabled");

  const flat = (k: Flat) => (
    <NumberField label={key(k.slice("battle.".length))} value={draft[k]} onChange={(v) => set({ ...draft, [k]: v })} min={0} max={MAX} />
  );
  const group = (g: Group, label: (sub: string) => string = key) =>
    Object.keys(draft[g]).map((sub) => (
      <NumberField
        key={`${g}.${sub}`}
        label={label(sub)}
        value={(draft[g] as Record<string, number>)[sub]}
        onChange={(v) => set({ ...draft, [g]: { ...draft[g], [sub]: v } })}
        min={0}
        max={MAX}
      />
    ));

  const save = () =>
    startTransition(async () => {
      try {
        const res = await updateCombatSettings(draft);
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
        <Toggle label={key("enabled")} checked={draft["battle.enabled"]} onChange={(v) => set({ ...draft, "battle.enabled": v })} />
      </fieldset>

      <fieldset className={box}>
        <legend className="px-1 font-bold">{t("flow")}</legend>
        {flat("battle.turnSeconds")}
        {flat("battle.maxMissedTurns")}
        {flat("battle.maxTurns")}
        {flat("battle.firstTurnActions")}
        {flat("battle.queueSeconds")}
        {flat("battle.roomMinutes")}
        {flat("battle.pollSeconds")}
      </fieldset>

      <fieldset className={box}>
        <legend className="px-1 font-bold">{t("stats")}</legend>
        {group("battle.stats")}
      </fieldset>

      <fieldset className={box}>
        <legend className="px-1 font-bold">{t("damage")}</legend>
        {group("battle.damage")}
      </fieldset>

      <fieldset className={box}>
        <legend className="px-1 font-bold">{t("orbs")}</legend>
        {group("battle.orbs")}
      </fieldset>

      <fieldset className={box}>
        <legend className="px-1 font-bold">{t("keywordsByRarity")}</legend>
        {group("battle.keywordsByRarity", (r) => tRarity(r as (typeof RARITIES)[number]))}
      </fieldset>

      <fieldset className={box}>
        <legend className="px-1 font-bold">{t("keywordValues")}</legend>
        {group("battle.keywordValues")}
      </fieldset>

      <fieldset className={box}>
        <legend className="px-1 font-bold">{t("techniques")}</legend>
        <p className="text-xs text-text-muted sm:col-span-2">{t("valueHint")}</p>
        {TECHNIQUES.map((tech) =>
          (["cost", "value"] as const).map((sub) => (
            <NumberField
              key={`${tech}.${sub}`}
              label={`${tBattle(`techniques.${tech}.name`)} : ${key(sub)}`}
              value={draft["battle.techniques"][tech][sub]}
              onChange={(v) =>
                set({ ...draft, "battle.techniques": { ...draft["battle.techniques"], [tech]: { ...draft["battle.techniques"][tech], [sub]: v } } })
              }
              min={0}
              max={MAX}
            />
          )),
        )}
      </fieldset>

      <fieldset className={box}>
        <legend className="px-1 font-bold">{t("bot")}</legend>
        {flat("battle.botMistakePct")}
        {flat("battle.botUpgradePct")}
      </fieldset>

      <fieldset className={box}>
        <legend className="px-1 font-bold">{t("rewards")}</legend>
        {group("battle.rewards")}
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
