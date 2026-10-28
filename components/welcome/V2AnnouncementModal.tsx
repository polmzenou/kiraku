"use client";

import { useTranslations } from "next-intl";
import { useId, type CSSProperties, type ReactNode } from "react";
import { BoosterArt } from "@/components/boosters/BoosterArt";
import { Fuda } from "@/components/fuda/Fuda";
import { X_HANDLE, X_URL } from "@/lib/links";
import type { ShowcaseCard } from "@/server/welcome";
import { SEALED_TEASER } from "./sealed-teaser";
import { useAnnouncementDialog } from "./useAnnouncementDialog";

// Cartes en éventail (les premières de la vitrine) ; les autres sont seulement comptées.
const FAN_SIZE = 5;

const THIS_WEEK = [
  { key: "shop", glyph: "店" },
  { key: "profile", glyph: "飾" },
  { key: "ambassadors", glyph: "使" },
] as const;

const SOON = [
  { key: "casino", glyph: "賭" },
  { key: "rarities", glyph: "稀" },
  { key: "battle", glyph: "戦" },
] as const;

export function V2AnnouncementModal({ userId, cards }: { userId: string; cards: ShowcaseCard[] }) {
  const t = useTranslations("v2Announcement");
  const common = useTranslations("common");
  const dialog = useAnnouncementDialog(userId, "v2");
  const titleId = useId();
  const descriptionId = useId();

  const fanned = cards.slice(0, FAN_SIZE);
  const hidden = cards.length - fanned.length;

  const close = () => dialog.current?.close();
  const strong = (chunks: ReactNode) => <strong className="font-medium text-text">{chunks}</strong>;

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
              <p id={descriptionId} className="mt-3 max-w-md text-sm leading-relaxed text-text-muted">{t("intro")}</p>
            </div>
            <div aria-hidden="true" className="mt-10 hidden h-32 w-22 shrink-0 rotate-4 flex-col items-center justify-center gap-2 rounded-xl border border-kin/65 bg-kin/10 text-link shadow-xl min-[420px]:flex">
              <span className="font-seal text-4xl" lang="ja">新</span>
              <span className="text-[9px] font-bold tracking-[0.2em]">V2</span>
            </div>
          </div>
        </header>

        <div className="space-y-4 px-5 py-5 sm:px-8 sm:py-6">
          <section aria-labelledby={`${titleId}-now`} className="rounded-2xl border border-kin/35 bg-kin/6 p-4">
            <h3 id={`${titleId}-now`} className="flex items-center gap-2 text-sm font-bold text-link">
              <span aria-hidden="true" lang="ja" className="font-seal">今</span> {t("now.title")}
            </h3>
            <ul className="mt-3 grid gap-2.5">
              <Item glyph="彩" title={t("now.design.title")} body={t("now.design.body")} />
              <Item glyph="金" title={t("now.cards.title")} body={t.rich("now.cards.body", { strong })} />
            </ul>
            {fanned.length > 0 && (
              <div className="mt-4">
                <ul aria-label={t("now.cards.preview")} className="relative h-48 sm:h-56">
                  {fanned.map((card, index) => {
                    const offset = index - (fanned.length - 1) / 2;
                    return (
                      <li
                        key={card.id}
                        // Éventail tenu en main : chaque carte pivote autour d'un point sous le paquet
                        style={{ "--r": `${offset * 9}deg`, zIndex: 10 - Math.abs(Math.round(offset)) } as CSSProperties}
                        className={`absolute bottom-4 left-1/2 -ml-12 w-24 origin-[50%_220%] [rotate:var(--r)] transition-[rotate] duration-700 ease-out starting:[rotate:0deg] motion-reduce:transition-none sm:-ml-14 sm:w-28 ${
                          offset === 0 ? "-translate-y-2" : ""
                        }`}
                      >
                        <Fuda card={card} size="sm" tilt={false} sizes="112px" describeImage />
                      </li>
                    );
                  })}
                </ul>
                {hidden > 0 && <p className="text-center text-xs text-text-muted">{t("now.cards.more", { count: hidden })}</p>}
              </div>
            )}
          </section>

          <section aria-labelledby={`${titleId}-week`} className="rounded-2xl border border-ai/30 bg-ai/8 p-4">
            <h3 id={`${titleId}-week`} className="flex items-center gap-2 text-sm font-bold">
              <span aria-hidden="true" lang="ja" className="font-seal text-ai">週</span> {t("week.title")}
            </h3>
            <ul className="mt-3 grid gap-2.5">
              <li className="rounded-2xl border border-border bg-surface/70 p-3">
                <p className="text-sm font-bold">{t("week.boosters.title")}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-text-muted">{t("week.boosters.body")}</p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {SEALED_TEASER.map(({ key, emblem, theme }) => (
                    <div key={key} className="flex flex-col items-center gap-2">
                      <div className="w-20 sm:w-24">
                        <BoosterArt shape="SACHET" theme={theme} emblem={emblem} name={t(`week.boosters.${key}`)} contents="" compact />
                      </div>
                      <p className="max-w-full text-center font-title text-[11px] font-extrabold whitespace-nowrap sm:text-sm sm:tracking-[0.12em]">{t(`week.boosters.${key}`)}</p>
                    </div>
                  ))}
                </div>
              </li>
              {THIS_WEEK.map(({ key, glyph }) => (
                <Item key={key} glyph={glyph} title={t(`week.${key}.title`)} body={t(`week.${key}.body`)} />
              ))}
            </ul>
          </section>

          <section aria-labelledby={`${titleId}-soon`} className="rounded-2xl border border-border bg-surface/50 p-4">
            <h3 id={`${titleId}-soon`} className="flex items-center gap-2 text-sm font-bold">
              <span aria-hidden="true" lang="ja" className="font-seal text-shu">近</span> {t("soon.title")}
            </h3>
            <ul className="mt-3 flex flex-wrap gap-2">
              {SOON.map(({ key, glyph }) => (
                <li key={key} className="flex items-center gap-2 rounded-full border border-border bg-bg/60 py-1.5 pr-3.5 pl-3">
                  <span aria-hidden="true" lang="ja" className="font-seal text-lg text-text-muted">{glyph}</span>
                  <span className="text-sm font-medium">{t(`soon.${key}`)}</span>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby={`${titleId}-x`} className="flex items-start gap-3 rounded-2xl border border-ai/30 bg-ai/8 p-4">
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

function Item({ glyph, title, body }: { glyph: string; title: string; body: ReactNode }) {
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-border bg-surface/70 p-3">
      <span aria-hidden="true" lang="ja" className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-kin/40 bg-kin/10 font-seal text-2xl text-link">{glyph}</span>
      <div className="min-w-0">
        <p className="text-sm font-bold">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-text-muted">{body}</p>
      </div>
    </li>
  );
}
