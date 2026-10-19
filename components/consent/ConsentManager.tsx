"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { CONSENT_OPEN_EVENT, makeConsent, needsPrompt } from "@/lib/consent/consent";
import { readConsent, writeConsent } from "@/lib/consent/consent-dom";
import { optionalCategories, type ConsentCategory } from "@/lib/consent/registry";
import { Button } from "../ui/Button";
import { Sheet } from "../ui/Sheet";

const OPTIONAL = optionalCategories();

/**
 * Bandeau et panneau de consentement (règles CNIL) : rien de non exempté avant le choix,
 * « Tout refuser » et « Tout accepter » de même poids, « Personnaliser » à côté, choix redemandé
 * après 6 mois. Tant que le registre ne contient que des traceurs exemptés, le bandeau ne s'affiche
 * jamais ; le panneau reste ouvrable (« Gérer les cookies ») et l'explique.
 */
export function ConsentManager() {
  const t = useTranslations("consent");
  const [banner, setBanner] = useState(false);
  const [panel, setPanel] = useState(false);
  const [draft, setDraft] = useState<Partial<Record<ConsentCategory, boolean>>>({});

  useEffect(() => {
    // Lu après l'hydratation : le serveur ne connaît pas le cookie de ce navigateur
    const timer = window.setTimeout(() => setBanner(needsPrompt(readConsent(), OPTIONAL, Date.now())), 0);
    const open = () => {
      setDraft(readConsent()?.choices ?? {});
      setPanel(true);
    };
    window.addEventListener(CONSENT_OPEN_EVENT, open);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(CONSENT_OPEN_EVENT, open);
    };
  }, []);

  function decide(choice: boolean | Partial<Record<ConsentCategory, boolean>>) {
    writeConsent(makeConsent(OPTIONAL, choice, Date.now()));
    setBanner(false);
    setPanel(false);
  }

  const choiceButtons = (
    <div className="grid grid-cols-2 gap-2">
      <Button type="button" onClick={() => decide(false)}>
        {t("refuseAll")}
      </Button>
      <Button type="button" onClick={() => decide(true)}>
        {t("acceptAll")}
      </Button>
    </div>
  );

  return (
    <>
      {banner && !panel && (
        <section
          aria-label={t("bannerLabel")}
          className="fixed inset-x-[max(0.75rem,env(safe-area-inset-left))] bottom-[var(--mobile-nav-height)] z-40 mx-auto max-w-[1200px] rounded-hero border border-border bg-surface px-4 py-3 shadow-float md:bottom-4 md:px-5"
        >
          <div className="mx-auto flex max-w-[1200px] flex-col gap-3 md:flex-row md:items-center">
            <p className="flex-1 text-sm">
              {t("bannerBody")}{" "}
              <Link href="/cookies" className="font-medium text-ai underline underline-offset-4">
                {t("learnMore")}
              </Link>
            </p>
            <div className="flex flex-col gap-2 md:w-[28rem]">
              {choiceButtons}
              <button
                type="button"
                onClick={() => {
                  setDraft({});
                  setPanel(true);
                }}
                className="min-h-11 text-sm font-medium underline underline-offset-4"
              >
                {t("customize")}
              </button>
            </div>
          </div>
        </section>
      )}

      <Sheet open={panel} onClose={() => setPanel(false)} title={t("panelTitle")}>
        <p className="text-sm text-text-muted">{OPTIONAL.length === 0 ? t("onlyNecessary") : t("panelIntro")}</p>
        <ul className="flex flex-col gap-2">
          <li className="lacquer flex items-start justify-between gap-3 rounded-card p-3.5">
            <div className="flex flex-col gap-1">
              <p className="font-bold">{t("categories.necessary")}</p>
              <p className="text-xs text-text-muted">{t("categoryHelp.necessary")}</p>
            </div>
            <span className="shrink-0 text-xs text-text-muted">{t("alwaysOn")}</span>
          </li>
          {OPTIONAL.map((c) => (
            <li key={c} className="lacquer flex items-start justify-between gap-3 rounded-card p-3.5">
              <label htmlFor={`consent-${c}`} className="flex flex-col gap-1">
                <span className="font-bold">{t(`categories.${c}`)}</span>
                <span className="text-xs text-text-muted">{t(`categoryHelp.${c}`)}</span>
              </label>
              <input
                id={`consent-${c}`}
                type="checkbox"
                checked={draft[c] === true}
                onChange={(e) => setDraft((d) => ({ ...d, [c]: e.target.checked }))}
                role="switch"
                className="switch"
              />
            </li>
          ))}
        </ul>
        {OPTIONAL.length > 0 && (
          <>
            {choiceButtons}
            <Button type="button" variant="primary" onClick={() => decide(draft)}>
              {t("save")}
            </Button>
          </>
        )}
        <Link href="/cookies" onClick={() => setPanel(false)} className="text-sm font-medium text-ai underline underline-offset-4">
          {t("learnMore")}
        </Link>
      </Sheet>
    </>
  );
}
