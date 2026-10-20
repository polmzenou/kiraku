"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { claimV1WelcomeAction } from "@/server/actions/welcome";

// Nouveautés de la v1.5 ; les échanges du Marché ont leur propre encart plus bas.
const FEATURES = [
  { key: "chat", glyph: "話", href: "/amis" },
  { key: "profile", glyph: "飾", href: null },
  { key: "cards", glyph: "金", href: "/wiki" },
  { key: "animations", glyph: "動", href: "/" },
] as const;

// On attend un écran de découverte : aucune interruption d'ouverture, de combat ou de connexion.
const DISCOVERY_ROUTES = new Set(["", "wiki", "collection", "boutique", "amis", "marche", "compte", "missions", "classement", "parrainage", "notifications", "combat"]);

export function V1WelcomeModal({
  userId,
  username,
  discordBonus,
  contactUrl,
}: {
  userId: string;
  username: string;
  discordBonus: number;
  contactUrl: string | null;
}) {
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

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onClick={(event) => { if (event.target === dialog.current) close(); }}
      className="fixed inset-0 m-auto max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] max-w-3xl overflow-hidden rounded-3xl border border-kin/30 bg-bg p-0 text-text opacity-0 shadow-[0_24px_100px_rgb(0_0_0/0.45)] transition-[opacity,translate,display,overlay] transition-discrete duration-300 backdrop:bg-black/75 backdrop:backdrop-blur-sm open:flex open:translate-y-0 open:flex-col open:opacity-100 starting:open:translate-y-4 starting:open:opacity-0 motion-reduce:transition-none"
    >
      <div className="min-h-0 overflow-y-auto overscroll-contain">
        <header className="relative isolate overflow-hidden border-b border-kin/20 px-5 pt-8 pb-7 sm:px-8 sm:pt-9">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,var(--k-kin),transparent_65%)] opacity-15" />
          <button
            type="button"
            aria-label={common("close")}
            onClick={close}
            className="absolute top-3 right-3 z-10 flex size-11 items-center justify-center rounded-full border border-border bg-bg/70 text-2xl text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
          >
            <span aria-hidden="true">×</span>
          </button>
          <div className="relative z-1 sm:max-w-[68%]">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-kin/35 bg-kin/10 px-3 py-1 text-xs font-bold tracking-wide text-link">
              <span aria-hidden="true">✦</span> {t("badge")}
            </p>
            <h2 id={titleId} tabIndex={-1} className="font-title text-3xl leading-tight font-extrabold outline-none sm:text-4xl">
              {t("title")}<br />
              <span className="text-link">{t("titleAccent")}</span>
            </h2>
            <p id={descriptionId} className="mt-3 max-w-md text-sm leading-relaxed text-text-muted">{t("intro")}</p>
          </div>
          <div aria-hidden="true" className="pointer-events-none absolute top-14 right-9 hidden h-40 w-36 sm:block">
            <span className="absolute top-2 -left-4 h-36 w-24 -rotate-18 rounded-xl border border-shu/35 bg-shu/10" />
            <span className="absolute top-1 right-0 h-36 w-24 rotate-15 rounded-xl border border-ai/40 bg-ai/10" />
            <div className="welcome-v1-card absolute top-0 left-2 flex h-36 w-24 -rotate-3 flex-col items-center justify-center gap-2 rounded-xl border border-kin/65 text-kin shadow-xl">
              <span className="font-seal text-4xl" lang="ja">新</span>
              <span className="font-title text-2xl font-extrabold">1.5</span>
              <span className="text-[8px] font-bold tracking-[0.2em]">KIRAKU-KUN</span>
            </div>
            <span className="absolute -top-4 right-1 text-2xl text-kin">✦</span>
            <span className="absolute bottom-0 -left-6 text-lg text-shu">✦</span>
            <span className="absolute right-0 bottom-1 text-xs text-kin">✧</span>
          </div>
        </header>

        <div className="space-y-5 px-5 py-5 sm:px-8 sm:py-6">
          <section aria-labelledby={`${titleId}-features`}>
            <h3 id={`${titleId}-features`} className="mb-3 text-xs font-bold tracking-widest text-text-muted uppercase">{t("available")}</h3>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {FEATURES.map(({ key, glyph, href }) => (
                <Link key={key} href={href ?? `/u/${encodeURIComponent(username)}`} onClick={close} className="group flex gap-3 rounded-2xl border border-border bg-surface/70 p-3.5 transition-colors hover:border-kin/50 hover:bg-surface-2">
                  <span aria-hidden="true" lang="ja" className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-kin/20 bg-kin/8 font-seal text-2xl text-link">{glyph}</span>
                  <div className="min-w-0 flex-1">
                    <h4 className="mb-1 flex items-center justify-between gap-2 text-sm font-bold">
                      {t(`features.${key}.title`)}
                      <span aria-hidden="true" className="text-text-muted transition-transform group-hover:translate-x-0.5">↗</span>
                    </h4>
                    <p className="text-xs leading-relaxed text-text-muted">{t(`features.${key}.body`)}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          <section aria-labelledby={`${titleId}-trades`} className="rounded-2xl border border-shu/35 bg-shu/8 p-4">
            <div className="flex gap-3">
              <span aria-hidden="true" lang="ja" className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-shu/30 bg-shu/10 font-seal text-2xl text-shu">換</span>
              <div className="min-w-0 flex-1">
                <h3 id={`${titleId}-trades`} className="flex flex-wrap items-center gap-2 text-sm font-bold">
                  {t("trades.title")}
                  <span className="rounded-full border border-kin/40 bg-kin/10 px-2 py-0.5 text-[11px] font-bold text-link">{t("trades.badge")}</span>
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-text-muted">{t("trades.body")}</p>
                <p className="mt-2 text-xs leading-relaxed text-text-muted">
                  {t.rich("trades.dev", { strong: (chunks) => <strong className="font-medium text-text">{chunks}</strong> })}
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Link
                href="/marche?onglet=echanges"
                onClick={close}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-shu-btn px-5 text-sm font-bold text-washi-paper transition-colors hover:bg-shu"
              >
                {t("trades.cta")} <span aria-hidden="true">→</span>
              </Link>
              {contactUrl && (
                <a
                  href={contactUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-bg/60 px-5 text-sm font-bold transition-colors hover:bg-surface-2"
                >
                  {t("trades.contact")} <span aria-hidden="true">↗</span>
                </a>
              )}
            </div>
          </section>

          <Link href="/compte" onClick={close} className="group flex items-start gap-3 rounded-2xl border border-ai/30 bg-ai/8 p-4 transition-colors hover:border-ai/60 hover:bg-ai/15">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="mt-0.5 size-7 shrink-0 text-ai">
              <path d="M19.7 5.1a18 18 0 0 0-4.4-1.4l-.5 1a16 16 0 0 0-5.6 0l-.5-1a18 18 0 0 0-4.4 1.4C1.5 9.2.7 13.2 1.1 17.2a18 18 0 0 0 5.4 2.7l1.1-1.8-1.7-.8.4-.3a12.7 12.7 0 0 0 11.4 0l.4.3-1.7.8 1.1 1.8a18 18 0 0 0 5.4-2.7c.5-4.7-.8-8.7-3.2-12.1ZM8.5 14.8c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Zm7 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Z" />
            </svg>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold">{t("discord.title")}</h3>
              <p className="mt-1 text-xs leading-relaxed text-text-muted">{t("discord.body")}</p>
              {discordBonus > 0 && <p className="mt-2 text-xs font-bold text-link">{t("discord.bonus", { amount: discordBonus })}</p>}
            </div>
            <span aria-hidden="true" className="text-ai">↗</span>
          </Link>

          <section aria-labelledby={`${titleId}-soon`} className="relative overflow-hidden rounded-2xl border border-kin/25 bg-kin/5 p-4">
            <h3 id={`${titleId}-soon`} className="mb-2 flex items-center gap-2 text-sm font-bold text-link">
              <span aria-hidden="true">✦</span> {t("soon.title")}
            </h3>
            <p className="text-xs leading-relaxed text-text-muted">
              {t.rich("soon.body", { strong: (chunks) => <strong className="font-medium text-text">{chunks}</strong> })}
            </p>
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
