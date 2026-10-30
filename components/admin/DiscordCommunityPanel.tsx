"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { publishDiscordRolesAction, publishDiscordRulesAction, type PublishRulesResult } from "@/server/actions/discord-community";
import { inputClass } from "./fields";
import { Button } from "../ui/Button";

export function DiscordCommunityPanel({ configured, endpoint, rulesUrl, rolesConfigured, rolesUrl, linkedConfigured }: {
  configured: boolean;
  endpoint: string;
  rulesUrl: string | null;
  rolesConfigured: boolean;
  rolesUrl: string | null;
  linkedConfigured: boolean;
}) {
  const t = useTranslations("admin.discord.community");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<PublishRulesResult | null>(null);
  const [rolesResult, setRolesResult] = useState<PublishRulesResult | null>(null);
  const url = result?.ok ? result.url : rulesUrl;
  const roleUrl = rolesResult?.ok ? rolesResult.url : rolesUrl;
  return (
    <section className="flex max-w-2xl flex-col gap-4 lacquer rounded-card p-4">
      <h3 className="font-title text-lg font-bold">{t("title")}</h3>
      <p className="text-sm text-text-muted">{t("intro")}</p>
      <label className="flex flex-col gap-2 text-sm">
        <span className="font-bold">{t("endpoint")}</span>
        <input readOnly value={endpoint} onFocus={(e) => e.currentTarget.select()} className={inputClass} />
      </label>
      <p className="text-sm text-text-muted">{t("endpointHint")}</p>
      {!configured && <p className="text-sm text-text-muted">{t("missing")}</p>}
      <Button
        type="button"
        variant="primary"
        disabled={!configured || pending}
        className="self-start"
        onClick={() => startTransition(async () => {
          try { setResult(await publishDiscordRulesAction()); }
          catch { setResult({ ok: false, error: "DISCORD" }); }
        })}
      >
        {pending ? t("publishing") : url ? t("update") : t("publish")}
      </Button>
      <div aria-live="polite" className="text-sm">
        {result && (result.ok ? t("success") : t(`errors.${result.error}`))}
      </div>
      {url && <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm text-link underline">{t("open")}</a>}
      <div className="mt-2 flex flex-col gap-3 border-t border-border pt-4">
        <h4 className="font-bold">{t("rolesTitle")}</h4>
        <p className="text-sm text-text-muted">{t("rolesIntro")}</p>
        {!rolesConfigured && <p className="text-sm text-text-muted">{t("rolesMissing")}</p>}
        <Button type="button" disabled={!rolesConfigured || pending} className="self-start" onClick={() => startTransition(async () => {
          try { setRolesResult(await publishDiscordRolesAction()); }
          catch { setRolesResult({ ok: false, error: "DISCORD" }); }
        })}>{pending ? t("publishing") : t("publishRoles")}</Button>
        <div aria-live="polite" className="text-sm">{rolesResult && (rolesResult.ok ? t("rolesSuccess") : t(`errors.${rolesResult.error}`))}</div>
        {roleUrl && <a href={roleUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-link underline">{t("openRoles")}</a>}
        <p className="text-sm text-text-muted">{linkedConfigured ? t("linkedReady") : t("linkedMissing")}</p>
      </div>
      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <h4 className="font-bold">{t("rankedTitle")}</h4>
        <p className="text-sm text-text-muted">{t("rankedIntro")}</p>
        <a href="/api/admin/discord/ranked-preview" target="_blank" rel="noopener noreferrer" className="self-start text-sm text-link underline">{t("rankedPreview")}</a>
      </div>
    </section>
  );
}
