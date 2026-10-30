"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";
import { DISCORD_IDEAS, useDiscordPoll } from "@/components/welcome/useDiscordPoll";
import { BANNER_ART, BANNER_FRAME, BANNER_TAG, BANNER_TEXT, BANNER_TITLE, SealVisual } from "./NewsBanner";

/**
 * Première bannière du carrousel pour un joueur connecté (invités compris) : le sondage « Un Discord
 * Kiraku ? » de l'annonce de la v2.5. Une seule réponse, définitive : qui a déjà voté voit son choix figé.
 */
export function NewsPollBanner({ vote, index, count, active }: { vote: boolean | null; index: number; count: number; active: boolean }) {
  const t = useTranslations("news");
  const tPoll = useTranslations("v25Announcement.discord");
  const poll = useDiscordPoll(vote);
  const id = useId();

  return (
    <article
      role="group"
      aria-roledescription={t("slideRole")}
      aria-label={t("slide", { n: index + 1, count })}
      data-tone="ai"
      data-kind="poll"
      data-active={active || undefined}
      className={`${BANNER_FRAME} wagara-shippo`}
    >
      <span aria-hidden="true" className="news-sheen pointer-events-none absolute inset-0 -z-10" />
      <div className={BANNER_ART}>
        <SealVisual icon="FRIENDS" />
      </div>
      <div className={BANNER_TEXT}>
        <p className={BANNER_TAG}>{t("pollTag")}</p>
        <h3 id={`${id}-question`} className={BANNER_TITLE}>
          {tPoll("title")}
        </h3>
        <p className="max-w-prose text-sm leading-relaxed text-white/90">{tPoll("body")}</p>
        <ul className="flex flex-wrap gap-1.5">
          {DISCORD_IDEAS.map((idea) => (
            <li key={idea} className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-white">
              {tPoll(`ideas.${idea}`)}
            </li>
          ))}
        </ul>
        <div role="group" aria-labelledby={`${id}-question`} className="mt-2 grid w-full max-w-sm grid-cols-2 gap-3">
          {([true, false] as const).map((value) => (
            <button
              key={String(value)}
              type="button"
              aria-pressed={poll.vote === value}
              disabled={poll.locked}
              onClick={() => poll.answer(value)}
              // Réponse définitive : le choix reste plein, l'autre bouton s'efface
              className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 border-white/35 bg-white/10 px-4 text-base font-bold text-white transition-colors enabled:hover:border-white/60 enabled:hover:bg-white/20 aria-pressed:border-(--nb-seal) aria-pressed:bg-(--nb-seal) aria-pressed:text-[#0a0f18] ${
                poll.pending || (poll.vote !== null && poll.vote !== value) ? "opacity-40" : ""
              }`}
            >
              {poll.vote === value && <span aria-hidden="true">✓</span>}
              {tPoll(value ? "yes" : "no")}
            </button>
          ))}
        </div>
        <p role="status" className="min-h-4 text-sm font-medium text-(--nb-seal)">
          {poll.status === "idle" ? "" : tPoll(poll.status)}
        </p>
      </div>
    </article>
  );
}
