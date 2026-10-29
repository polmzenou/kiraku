"use client";

import { useTranslations } from "next-intl";
import { useId, useState, useTransition, type ReactNode } from "react";
import { BoosterArt } from "@/components/boosters/BoosterArt";
import { Link } from "@/i18n/navigation";
import { X_HANDLE, X_URL } from "@/lib/links";
import { voteDiscordPollAction } from "@/server/actions/welcome";
import type { V25Data } from "@/server/welcome";
import { useAnnouncementDialog } from "./useAnnouncementDialog";

const DISCORD_IDEAS = ["news", "tournaments", "contests", "lotteries", "feedback", "cards"] as const;

/**
 * Annonce de la v2.5 : merci pour les 1 000 joueurs, parrainage à paliers, sondage « un Discord ? »,
 * Encens, nouvelle interface de combat, nouvelle boutique avec l'Impérial et rappel du compte X.
 */
export function V25AnnouncementModal({ userId, data }: { userId: string; data: V25Data }) {
  const t = useTranslations("v25Announcement");
  const common = useTranslations("common");
  const dialog = useAnnouncementDialog(userId, "v25");
  const titleId = useId();
  const descriptionId = useId();
  const [vote, setVote] = useState(data.vote);
  const [voteError, setVoteError] = useState(false);
  const [pending, startTransition] = useTransition();

  const close = () => dialog.current?.close();
  const strong = (chunks: ReactNode) => <strong className="font-medium text-text">{chunks}</strong>;
  const answer = (value: boolean) =>
    startTransition(async () => {
      const ok = await voteDiscordPollAction(value).catch(() => false);
      setVoteError(!ok);
      if (ok) setVote(value);
    });

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onClick={(event) => { if (event.target === dialog.current) close(); }}
      className="fixed inset-0 m-auto max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] max-w-2xl overflow-hidden rounded-3xl border border-kin/30 bg-bg p-0 text-text opacity-0 shadow-[0_24px_100px_rgb(0_0_0/0.45)] transition-[opacity,translate,display,overlay] transition-discrete duration-300 backdrop:bg-black/75 backdrop:backdrop-blur-sm open:flex open:translate-y-0 open:flex-col open:opacity-100 starting:open:translate-y-4 starting:open:opacity-0 motion-reduce:transition-none"
    >
      <div className="min-h-0 overflow-y-auto overscroll-contain">
        <header className="relative isolate overflow-hidden border-b border-kin/20 px-5 pt-8 pb-6 sm:px-8 sm:pt-9">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,var(--k-kin),transparent_65%)] opacity-15" />
          <button
            type="button"
            aria-label={common("close")}
            onClick={close}
            className="absolute top-3 right-3 z-10 flex size-11 items-center justify-center rounded-full border border-border bg-bg/70 text-2xl text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
          >
            <span aria-hidden="true">×</span>
          </button>
          <div className="flex items-start gap-5">
            <div className="min-w-0 flex-1">
              <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-shu/35 bg-shu/10 px-3 py-1 text-xs font-bold tracking-wide text-shu">
                <span aria-hidden="true">✦</span> {t("badge")}
              </p>
              <h2 id={titleId} tabIndex={-1} className="font-heading text-3xl leading-tight font-extrabold outline-none sm:text-4xl">
                {t("title")}<br />
                <span className="text-link">{t("titleAccent")}</span>
              </h2>
              <p id={descriptionId} className="mt-3 max-w-md text-sm leading-relaxed text-text-muted">{t.rich("intro", { strong })}</p>
            </div>
            <div aria-hidden="true" className="mt-10 hidden h-32 w-22 shrink-0 rotate-4 flex-col items-center justify-center gap-2 rounded-xl border border-kin/65 bg-kin/10 text-link shadow-xl min-[420px]:flex">
              <span className="font-seal text-4xl" lang="ja">祝</span>
              <span className="text-[9px] font-bold tracking-[0.2em]">V2.5</span>
            </div>
          </div>
        </header>

        <div className="space-y-4 px-5 py-5 sm:px-8 sm:py-6">
          <section aria-labelledby={`${titleId}-referral`} className="rounded-2xl border border-kin/45 bg-kin/8 p-4">
            <h3 id={`${titleId}-referral`} className="flex items-center gap-2 text-sm font-bold text-link">
              <span aria-hidden="true" lang="ja" className="font-seal">縁</span> {t("referral.title")}
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-text-muted">{t.rich("referral.body", { strong })}</p>
            {data.milestones.length > 0 && (
              <ol className="mt-3 grid gap-2 sm:grid-cols-2">
                {data.milestones.map((m) => (
                  <li key={m.referrals} className="flex items-center gap-3 rounded-xl border border-kin/30 bg-bg/50 px-3 py-2">
                    <span className="shrink-0 text-xs font-bold tabular-nums text-link">{t("referral.friends", { count: m.referrals })}</span>
                    <span className="min-w-0 text-xs font-medium">{m.reward}</span>
                  </li>
                ))}
              </ol>
            )}
            <Link
              href="/parrainage"
              onClick={close}
              className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-kin/50 bg-kin/10 px-5 text-sm font-bold text-link transition-colors hover:bg-kin/20"
            >
              {t("referral.cta")} <span aria-hidden="true">→</span>
            </Link>
          </section>

          <section aria-labelledby={`${titleId}-discord`} className="rounded-2xl border border-ai/30 bg-ai/8 p-4">
            <h3 id={`${titleId}-discord`} className="flex items-center gap-2 text-sm font-bold">
              <span aria-hidden="true" lang="ja" className="font-seal text-ai">輪</span> {t("discord.title")}
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-text-muted">{t("discord.body")}</p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {DISCORD_IDEAS.map((idea) => (
                <li key={idea} className="rounded-full border border-ai/30 bg-bg/50 px-2.5 py-0.5 text-[11px] font-medium">{t(`discord.ideas.${idea}`)}</li>
              ))}
            </ul>
            <div role="group" aria-label={t("discord.title")} className="mt-3 grid grid-cols-2 gap-3">
              {([true, false] as const).map((value) => (
                <button
                  key={String(value)}
                  type="button"
                  aria-pressed={vote === value}
                  disabled={pending}
                  onClick={() => answer(value)}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-bg/60 px-4 text-sm font-bold transition-colors hover:bg-surface-2 disabled:opacity-60 aria-pressed:border-ai aria-pressed:bg-ai/20 aria-pressed:text-ai"
                >
                  {t(value ? "discord.yes" : "discord.no")}
                </button>
              ))}
            </div>
            <p role="status" className="mt-2 min-h-4 text-xs text-text-muted">
              {voteError ? t("discord.error") : vote !== null ? t("discord.thanks") : ""}
            </p>
          </section>

          <section aria-labelledby={`${titleId}-incense`} className="flex items-start gap-3 rounded-2xl border border-kin/35 bg-kin/6 p-4">
            <span aria-hidden="true" lang="ja" className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-kin/40 bg-kin/10 font-seal text-2xl text-link">香</span>
            <div className="min-w-0">
              <h3 id={`${titleId}-incense`} className="text-sm font-bold">{t("incense.title")}</h3>
              <p className="mt-1 text-xs leading-relaxed text-text-muted">
                {t.rich("incense.body", { strong, cards: data.incense.cardStep, hours: data.incense.hours })}
              </p>
            </div>
          </section>

          <section aria-labelledby={`${titleId}-battle`} className="flex items-start gap-3 rounded-2xl border border-shu/30 bg-shu/6 p-4">
            <span aria-hidden="true" lang="ja" className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-shu/40 bg-shu/10 font-seal text-2xl text-shu">闘</span>
            <div className="min-w-0">
              <h3 id={`${titleId}-battle`} className="text-sm font-bold">{t("battle.title")}</h3>
              <p className="mt-1 text-xs leading-relaxed text-text-muted">{t.rich("battle.body", { strong })}</p>
            </div>
          </section>

          <section aria-labelledby={`${titleId}-shop`} className="rounded-2xl border border-ai/30 bg-ai/8 p-4">
            <div className="flex items-center gap-4">
              {data.imperial && (
                <div className="w-16 shrink-0 sm:w-20">
                  <BoosterArt shape={data.imperial.shape} theme={data.imperial.theme} emblem={data.imperial.emblem} name={data.imperial.name} contents="" compact />
                </div>
              )}
              <div className="min-w-0">
                <h3 id={`${titleId}-shop`} className="flex items-center gap-2 text-sm font-bold">
                  <span aria-hidden="true" lang="ja" className="font-seal text-ai">店</span> {t("shop.title")}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-text-muted">
                  {t.rich("shop.body", { strong, booster: data.imperial?.name ?? t("shop.imperial") })}
                </p>
                <Link
                  href="/boutique"
                  onClick={close}
                  className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-bg/60 px-5 text-sm font-bold transition-colors hover:bg-surface-2"
                >
                  {t("shop.cta")} <span aria-hidden="true">→</span>
                </Link>
              </div>
            </div>
          </section>

          <section aria-labelledby={`${titleId}-x`} className="flex items-start gap-3 rounded-2xl border border-border bg-surface/50 p-4">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="mt-0.5 size-7 shrink-0 text-text">
              <path d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.77L17.75 3Zm-1.08 16.17h1.7L7.4 4.74H5.58l11.09 14.43Z" />
            </svg>
            <div className="min-w-0 flex-1">
              <h3 id={`${titleId}-x`} className="text-sm font-bold">{t("x.title")}</h3>
              <p className="mt-1 text-xs leading-relaxed text-text-muted">{t.rich("x.body", { strong, handle: X_HANDLE })}</p>
              <a
                href={X_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-bg/60 px-5 text-sm font-bold transition-colors hover:bg-surface-2"
              >
                {t("x.cta", { handle: X_HANDLE })} <span aria-hidden="true">↗</span>
              </a>
            </div>
          </section>
        </div>
      </div>

      <footer className="flex shrink-0 flex-col items-center gap-3 border-t border-border bg-surface/80 px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-between sm:px-8">
        <p className="text-center text-xs text-text-muted sm:text-left">{t("thanks")}</p>
        <button type="button" onClick={close} className="inline-flex min-h-11 w-full items-center justify-center gap-3 rounded-xl bg-shu-btn px-6 text-sm font-bold text-washi-paper transition-colors hover:bg-shu sm:w-auto">
          {t("letsGo")} <span aria-hidden="true">→</span>
        </button>
      </footer>
    </dialog>
  );
}
