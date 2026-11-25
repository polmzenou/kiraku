"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { RANK_SEAL, type AchievementRank } from "@/lib/achievements/catalog";
import { normalizeGoals } from "@/lib/achievements/evaluate";
import { RANK_STYLE } from "@/lib/achievements/style";
import { ACHIEVEMENT_SETTING_KEYS, achievementSettingsSchema, type AchievementSettingsForm as Settings } from "@/lib/settings/achievements-form";
import { changedSettingKeys } from "@/lib/settings/form";
import { updateAchievementSettings } from "@/server/actions/admin-settings";
import { inputClass, Toggle } from "./fields";
import { SettingsSaveBar } from "./SettingsSaveBar";

export type AdminAchievementRow = {
  key: string;
  rank: AchievementRank;
  name: string;
  /** Description avec le seuil du catalogue. */
  desc: string;
  defaultGoal: number;
  adjustable: boolean;
  /** Joueurs qui l'ont débloqué. */
  unlocked: number;
};

export type AdminAchievementGroup = { category: string; kanji: string; title: string; rows: AdminAchievementRow[] };

const LABEL_KEY = {
  "achievements.enabled": "enabled",
  "achievements.goals": "goals",
  "achievements.disabled": "disabled",
} as const satisfies Record<keyof Settings, string>;

/** Succès : interrupteur, seuil de chaque succès réglable (vide = catalogue) et succès actifs. */
export function AchievementSettingsForm({ initial, groups }: { initial: Settings; groups: AdminAchievementGroup[] }) {
  const t = useTranslations("admin.achievements");
  const [draft, setDraft] = useState(initial);
  const normalized: Settings = { ...draft, "achievements.goals": normalizeGoals(draft["achievements.goals"]) };
  const valid = achievementSettingsSchema.safeParse(normalized).success && Object.values(draft["achievements.goals"]).every((g) => Number.isInteger(g) && g >= 1);
  const changed = valid ? changedSettingKeys(ACHIEVEMENT_SETTING_KEYS, initial, normalized) : [];
  const disabled = new Set(draft["achievements.disabled"]);

  const setGoal = (key: string, value: number) =>
    setDraft((d) => {
      const goals = { ...d["achievements.goals"] };
      if (Number.isNaN(value)) delete goals[key];
      else goals[key] = value;
      return { ...d, "achievements.goals": goals };
    });
  const setActive = (key: string, active: boolean) =>
    setDraft((d) => {
      const off = new Set(d["achievements.disabled"]);
      if (active) off.delete(key);
      else off.add(key);
      return { ...d, "achievements.disabled": [...off] };
    });

  return (
    <form className="flex flex-col gap-6" onSubmit={(e) => e.preventDefault()}>
      <div className="lacquer flex flex-col gap-2 rounded-card p-4">
        <Toggle label={t("settings.enabled")} checked={draft["achievements.enabled"]} onChange={(v) => setDraft((d) => ({ ...d, "achievements.enabled": v }))} />
        <p className="text-xs text-text-muted">{t("settings.enabledHint")}</p>
      </div>

      {groups.map((group) => (
        <section key={group.category} className="flex flex-col gap-2">
          <h3 className="flex items-baseline gap-2 font-title text-lg font-bold">
            <span aria-hidden="true" lang="ja" className="font-seal text-shu">
              {group.kanji}
            </span>
            {group.title}
          </h3>
          <ul className="flex flex-col gap-2">
            {group.rows.map((row) => {
              const goal = draft["achievements.goals"][row.key];
              const active = !disabled.has(row.key);
              return (
                <li key={row.key} className={`flex flex-wrap items-center gap-3 rounded-control border border-border bg-surface p-3 ${active ? "" : "opacity-60"}`}>
                  <span aria-hidden="true" lang="ja" className={`flex size-9 shrink-0 items-center justify-center rounded-control border font-seal ${RANK_STYLE[row.rank].seal}`}>
                    {RANK_SEAL[row.rank]}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="font-bold">{row.name}</span>
                    <span className="text-xs text-text-muted">{row.desc}</span>
                    <span className="text-xs text-text-muted">
                      <code className="font-sans">{row.key}</code> · {t("unlocked", { count: row.unlocked })}
                    </span>
                  </div>
                  <div className="w-32 shrink-0">
                    {row.adjustable ? (
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={100_000_000}
                        step={1}
                        value={goal ?? ""}
                        placeholder={String(row.defaultGoal)}
                        aria-label={t("goalLabel", { name: row.name })}
                        aria-invalid={goal !== undefined && (!Number.isInteger(goal) || goal < 1) ? true : undefined}
                        onChange={(e) => setGoal(row.key, e.target.value === "" ? Number.NaN : e.target.valueAsNumber)}
                        className={`${inputClass} tabular-nums`}
                      />
                    ) : (
                      <span className="text-xs text-text-muted">{t("fixed")}</span>
                    )}
                  </div>
                  <Toggle label={t("active")} checked={active} onChange={(v) => setActive(row.key, v)} />
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <SettingsSaveBar valid={valid} changedLabels={changed.map((k) => t(`settings.${LABEL_KEY[k]}`))} save={() => updateAchievementSettings(normalized)} />
    </form>
  );
}
