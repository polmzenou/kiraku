"use client";

import { useLocale, useTranslations } from "next-intl";
import { useId, type ReactNode } from "react";
import { BoosterArt } from "@/components/boosters/BoosterArt";
import { Fuda } from "@/components/fuda/Fuda";
import { useRarityDefinitions } from "@/lib/catalog/use-rarities";
import { X_HANDLE, X_URL } from "@/lib/links";
import type { ShowcaseCard } from "@/server/welcome";
import { SEALED_TEASER } from "./sealed-teaser";
import { useAnnouncementDialog } from "./useAnnouncementDialog";

/** Chance d'un sachet scellé, 1 sur N (0 = désactivé), lue dans les réglages du jeu. */
export type SealedOdds = Record<"divine" | "apocalypse", number>;

/**
 * Annonce en attendant la v3 : reconnexion possible après le changement d'hébergement, aperçu des
 * prochaines cartes AR et Gold (inclinables, avec leurs effets) et sachets scellés de la boutique.
 */
export function V3TeaserModal({ userId, cards, odds }: { userId: string; cards: ShowcaseCard[]; odds: SealedOdds }) {
  const t = useTranslations("v3Teaser");
  const common = useTranslations("common");
  const locale = useLocale();
  const definitions = useRarityDefinitions();
  const dialog = useAnnouncementDialog(userId, "v3Teaser");
  const titleId = useId();
  const descriptionId = useId();

  const close = () => dialog.current?.close();
  const strong = (chunks: ReactNode) => <strong className="font-medium text-text">{chunks}</strong>;
  const rarityName = (key: string) => {
    const definition = definitions.find((r) => r.key === key);
    return definition ? (locale === "en" ? definition.nameEn : definition.nameFr) : key;
  };

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
              <span className="font-seal text-4xl" lang="ja">待</span>
              <span className="text-[9px] font-bold tracking-[0.2em]">V3</span>
            </div>
          </div>
        </header>

        <div className="space-y-4 px-5 py-5 sm:px-8 sm:py-6">
          <section aria-labelledby={`${titleId}-login`} className="flex items-start gap-3 rounded-2xl border border-ai/30 bg-ai/8 p-4">
            <span aria-hidden="true" lang="ja" className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-ai/40 bg-ai/10 font-seal text-2xl text-ai">鍵</span>
            <div className="min-w-0">
              <h3 id={`${titleId}-login`} className="text-sm font-bold">{t("login.title")}</h3>
              <p className="mt-1 text-xs leading-relaxed text-text-muted">{t.rich("login.body", { strong })}</p>
            </div>
          </section>

          <section aria-labelledby={`${titleId}-cards`} className="rounded-2xl border border-kin/35 bg-kin/6 p-4">
            <h3 id={`${titleId}-cards`} className="flex items-center gap-2 text-sm font-bold text-link">
              <span aria-hidden="true" lang="ja" className="font-seal">彩</span> {t("cards.title")}
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-text-muted">{t.rich("cards.body", { strong })}</p>
            {cards.length > 0 && (
              <>
                <ul aria-label={t("cards.preview")} className="mx-auto mt-4 grid max-w-sm grid-cols-3 gap-3">
                  {cards.map((card) => (
                    <li key={card.id} className="flex flex-col items-center gap-2">
                      <div className="w-full">
                        <Fuda card={card} size="sm" sizes="(min-width: 640px) 120px, 30vw" describeImage />
                      </div>
                      <span className="rounded-full border border-kin/40 bg-kin/10 px-2.5 py-0.5 text-[11px] font-bold text-link">{rarityName(card.rarity)}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-center text-xs text-text-muted">{t("cards.hint")}</p>
              </>
            )}
          </section>

          <section aria-labelledby={`${titleId}-shop`} className="rounded-2xl border border-ai/30 bg-ai/8 p-4">
            <h3 id={`${titleId}-shop`} className="flex items-center gap-2 text-sm font-bold">
              <span aria-hidden="true" lang="ja" className="font-seal text-ai">店</span> {t("shop.title")}
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-text-muted">{t("shop.body")}</p>
            <ul className="mt-4 grid grid-cols-2 gap-3">
              {SEALED_TEASER.map(({ key, emblem, theme }) => (
                <li key={key} className="flex flex-col items-center gap-2">
                  <div className="w-20 sm:w-24">
                    <BoosterArt shape="SACHET" theme={theme} emblem={emblem} name={t(`shop.${key}`)} contents="" compact />
                  </div>
                  <p className="max-w-full text-center font-title text-[11px] font-extrabold whitespace-nowrap sm:text-sm sm:tracking-[0.12em]">{t(`shop.${key}`)}</p>
                  {odds[key] > 0 && <p className="text-center text-xs font-medium tabular-nums text-text-muted">{t("shop.odds", { odds: odds[key] })}</p>}
                </li>
              ))}
            </ul>
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
