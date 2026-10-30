"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { publishDiscordRulesAction, type PublishRulesResult } from "@/server/actions/discord-community";
import { inputClass } from "./fields";
import { Button } from "../ui/Button";

export function DiscordCommunityPanel({ configured, endpoint, rulesUrl }: {
  configured: boolean;
  endpoint: string;
  rulesUrl: string | null;
}) {
  const t = useTranslations("admin.discord.community");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<PublishRulesResult | null>(null);
  const url = result?.ok ? result.url : rulesUrl;
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
    </section>
  );
}
