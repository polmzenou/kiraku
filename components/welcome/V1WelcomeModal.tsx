"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { X_HANDLE, X_URL } from "@/lib/links";
import { claimV1WelcomeAction } from "@/server/actions/welcome";

// Excuses après la panne : les cadeaux sont versés aux inscrits depuis l'admin (envoi direct).
const GIFTS = [
  { key: "booster", glyph: "金" },
  { key: "zeni", glyph: "銭" },
] as const;

// On attend un écran de découverte : aucune interruption d'ouverture, de combat ou de connexion.
const DISCOVERY_ROUTES = new Set(["", "wiki", "collection", "boutique", "amis", "marche", "compte", "missions", "classement", "parrainage", "notifications", "combat"]);

export function V1WelcomeModal({ userId, isGuest }: { userId: string; isGuest: boolean }) {
  const t = useTranslations("v1Welcome");
  const common = useTranslations("common");
  const pathname = usePathname();
  const dialog = useRef<HTMLDialogElement>(null);
  const handled = useRef(false);
  const claim = useRef<Promise<boolean> | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const route = pathname.split("/")[1] ?? "";
    if (handled.current || !DISCOVERY_ROUTES.has(route) || (route === "combat" && pathname !== "/combat")) return;

    let cancelled = false;
    let timer: number;
    async function present() {
      const el = dialog.current;
      if (cancelled || !el) return;
      if (document.visibilityState !== "visible" || document.querySelector("dialog[open]")) {
        timer = window.setTimeout(() => void present(), 800);
        return;
      }
      try {
        // La promesse survit aux relances d'effet : jamais deux réservations pour ce composant.
        claim.current ??= claimV1WelcomeAction(userId);
        const allowed = await claim.current;
        if (cancelled) return;
        if (allowed) {
          // Une autre fenêtre modale peut avoir été ouverte pendant la requête.
          if (document.visibilityState !== "visible" || document.querySelector("dialog[open]")) {
            timer = window.setTimeout(() => void present(), 800);
            return;
          }
          el.showModal();
          el.querySelector("h2")?.focus({ preventScroll: true });
        }
        handled.current = true;
      } catch {
        // Une indisponibilité réseau ne bloque jamais la page ; nouvel essai à la prochaine visite.
        claim.current = null;
      }
    }

    timer = window.setTimeout(() => void present(), 800);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [pathname, userId]);

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
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,var(--k-shu),transparent_65%)] opacity-10" />
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
              <h2 id={titleId} tabIndex={-1} className="font-title text-3xl leading-tight font-extrabold outline-none sm:text-4xl">
                {t("title")}<br />
                <span className="text-link">{t("titleAccent")}</span>
              </h2>
              <p id={descriptionId} className="mt-3 max-w-md text-sm leading-relaxed text-text-muted">{t("intro")}</p>
            </div>
            <div aria-hidden="true" className="mt-10 hidden h-32 w-22 shrink-0 rotate-4 flex-col items-center justify-center gap-2 rounded-xl border border-shu/65 bg-shu/10 text-shu shadow-xl min-[420px]:flex">
              <span className="font-seal text-4xl" lang="ja">謝</span>
              <span className="text-[9px] font-bold tracking-[0.2em]">GOMEN</span>
            </div>
          </div>
        </header>

        <div className="space-y-4 px-5 py-5 sm:px-8 sm:py-6">
          <section aria-labelledby={`${titleId}-gifts`} className="rounded-2xl border border-kin/35 bg-kin/6 p-4">
            <h3 id={`${titleId}-gifts`} className="flex items-center gap-2 text-sm font-bold text-link">
              <span aria-hidden="true">✦</span> {t("gifts.title")}
            </h3>
            <p className="mt-1 mb-3 text-xs leading-relaxed text-text-muted">{t("gifts.intro")}</p>
            <ul className="grid gap-2.5 sm:grid-cols-2">
              {GIFTS.map(({ key, glyph }) => (
                <li key={key} className="flex items-center gap-3 rounded-2xl border border-border bg-surface/70 p-3">
                  <span aria-hidden="true" lang="ja" className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-kin/40 bg-kin/10 font-seal text-2xl text-link">{glyph}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold">{t(`gifts.${key}.title`)}</p>
                    <p className="mt-0.5 text-xs text-text-muted">{t(`gifts.${key}.body`)}</p>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs leading-relaxed text-text-muted">
              {isGuest
                ? t.rich("gifts.guest", {
                    strong,
                    link: (chunks) => <Link href="/compte" onClick={close} className="font-bold text-link underline underline-offset-4">{chunks}</Link>,
                  })
                : t.rich("gifts.registered", { strong })}
            </p>
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
