"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { publishCasinoTeaserAction, type PublishRulesResult } from "@/server/actions/discord-community";
import { Button } from "../ui/Button";

export type CasinoPreview = { label: string; content: string; image: string | null };

/** Casino sur Discord : teaser posté à la main, aperçu des trois annonces (teaser, ouverture, gros lancer). */
export function DiscordCasinoPanel({ configured, teaserUrl, previews }: { configured: boolean; teaserUrl: string | null; previews: CasinoPreview[] }) {
  const t = useTranslations("admin.discord");
  const tc = useTranslations("admin.discord.community");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<PublishRulesResult | null>(null);
  const url = result?.ok ? result.url : teaserUrl;
  return (
    <section className="flex max-w-2xl flex-col gap-4 lacquer rounded-card p-4">
      <h3 className="font-title text-lg font-bold">{t("casinoSection")}</h3>
      <p className="text-sm text-text-muted">{t("casinoIntro")}</p>
      {!configured && <p className="text-sm text-text-muted">{t("casinoNotConfigured")}</p>}
      <Button
        type="button"
        variant="primary"
        disabled={!configured || pending}
        className="self-start"
        onClick={() =>
          startTransition(async () => {
            try {
              setResult(await publishCasinoTeaserAction());
            } catch {
              setResult({ ok: false, error: "DISCORD" });
            }
          })
        }
      >
        {pending ? tc("publishing") : t("casinoTeaser")}
      </Button>
      <div aria-live="polite" className="text-sm">
        {result && (result.ok ? t("casinoTeaserDone") : tc(`errors.${result.error}`))}
      </div>
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center self-start text-sm text-link underline">
          {tc("open")}
        </a>
      )}
      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <h4 className="font-bold">{t("casinoPreview")}</h4>
        <ul className="flex flex-col gap-3">
          {previews.map((p) => (
            <li key={p.label} className="flex flex-col gap-2 rounded-control border border-border bg-surface p-3 text-sm">
              <b>{p.label}</b>
              <p className="break-words whitespace-pre-line text-text-muted">{p.content}</p>
              {p.image && (
                // Image publique de public/casino/discord, en taille réduite
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.image} alt="" width={600} height={315} loading="lazy" className="h-auto w-full max-w-sm rounded-control" />
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
