"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { JOIN_MODAL_TRIGGERS, type JoinModalConfig } from "@/lib/discord/join-modal";
import { changedSettingKeys } from "@/lib/settings/form";
import { DISCORD_SETTING_KEYS, discordSettingsSchema, type DiscordSettings } from "@/lib/settings/discord-form";
import { updateDiscordSettings } from "@/server/actions/admin-settings";
import { Field, inputClass, NumberField, Toggle } from "./fields";
import { SettingsSaveBar } from "./SettingsSaveBar";

/** Modal « Rejoins notre Discord » (désactivé par défaut) et bonus de liaison du compte Discord. */
export function DiscordSettingsForm({ initial }: { initial: DiscordSettings }) {
  const t = useTranslations("admin.discord");
  const [draft, setDraft] = useState(initial);
  const modal = draft["discord.joinModal"];
  const setModal = (patch: Partial<JoinModalConfig>) => setDraft((d) => ({ ...d, "discord.joinModal": { ...d["discord.joinModal"], ...patch } }));

  const valid = discordSettingsSchema.safeParse(draft).success;
  const changed = valid ? changedSettingKeys(DISCORD_SETTING_KEYS, initial, draft) : [];

  return (
    <form className="flex max-w-2xl flex-col gap-6" onSubmit={(e) => e.preventDefault()}>
      <fieldset className="flex min-w-0 flex-col gap-4 lacquer rounded-card p-4">
        <legend className="px-1 font-title text-lg font-bold">{t("marketSection")}</legend>
        <Toggle label={t("marketEnabled")} checked={draft["discord.marketEnabled"]} onChange={(v) => setDraft((d) => ({ ...d, "discord.marketEnabled": v }))} />
        <p className="text-sm text-text-muted">{t("marketHint")}</p>
      </fieldset>
      <fieldset className="flex min-w-0 flex-col gap-4 lacquer rounded-card p-4">
        <legend className="px-1 font-title text-lg font-bold">{t("modalSection")}</legend>
        <Toggle label={t("enabled")} checked={modal.enabled} onChange={(v) => setModal({ enabled: v })} />
        <Field label={t("inviteUrl")} hint={t("inviteUrlHint")}>
          {(id) => (
            <input
              id={id}
              type="url"
              inputMode="url"
              value={modal.inviteUrl}
              placeholder="https://discord.gg/…"
              onChange={(e) => setModal({ inviteUrl: e.target.value.trim() })}
              className={inputClass}
            />
          )}
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          {(["fr", "en"] as const).map((l) => (
            <Field key={l} label={t(`title_${l}`)}>
              {(id) => (
                <input
                  id={id}
                  value={modal.title[l]}
                  maxLength={80}
                  onChange={(e) => setModal({ title: { ...modal.title, [l]: e.target.value } })}
                  className={inputClass}
                />
              )}
            </Field>
          ))}
          {(["fr", "en"] as const).map((l) => (
            <Field key={l} label={t(`body_${l}`)}>
              {(id) => (
                <textarea
                  id={id}
                  value={modal.body[l]}
                  maxLength={300}
                  rows={3}
                  onChange={(e) => setModal({ body: { ...modal.body, [l]: e.target.value } })}
                  className={`${inputClass} py-2`}
                />
              )}
            </Field>
          ))}
        </div>
        <Field label={t("trigger")}>
          {(id) => (
            <select
              id={id}
              value={modal.trigger}
              onChange={(e) => setModal({ trigger: e.target.value as JoinModalConfig["trigger"] })}
              className={inputClass}
            >
              {JOIN_MODAL_TRIGGERS.map((tr) => (
                <option key={tr} value={tr}>
                  {t(`triggers.${tr}`)}
                </option>
              ))}
            </select>
          )}
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          {modal.trigger === "AFTER_BOOSTERS" && (
            <NumberField label={t("afterBoosters")} value={modal.afterBoosters} min={1} max={1_000} onChange={(v) => setModal({ afterBoosters: v })} />
          )}
          <NumberField label={t("cooldownDays")} value={modal.cooldownDays} min={0} max={365} onChange={(v) => setModal({ cooldownDays: v })} />
        </div>
        <Toggle label={t("showInFooter")} checked={modal.showInFooter} onChange={(v) => setModal({ showInFooter: v })} />
      </fieldset>

      <fieldset className="flex min-w-0 flex-col gap-4 lacquer rounded-card p-4">
        <legend className="px-1 font-title text-lg font-bold">{t("linkSection")}</legend>
        <NumberField
          label={t("linkBonusZeni")}
          hint={t("linkBonusHint")}
          value={draft["discord.linkBonusZeni"]}
          min={0}
          max={100_000}
          onChange={(v) => setDraft((d) => ({ ...d, "discord.linkBonusZeni": v }))}
        />
      </fieldset>

      <SettingsSaveBar valid={valid} changedLabels={changed.map((k) => t(`keys.${k}`))} save={() => updateDiscordSettings(draft)} />
    </form>
  );
}
