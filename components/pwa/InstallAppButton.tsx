"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "../ui/Button";
import { Sheet } from "../ui/Sheet";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

type Mode = "hidden" | "prompt" | "ios";

/** iPhone et iPad (iPadOS se présente comme un Mac tactile), hors application déjà installée. */
function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/**
 * « Installer l'app » : invite native sur Android et desktop (beforeinstallprompt), instructions sur
 * iOS (Partager → Sur l'écran d'accueil). Rien n'est affiché si l'app est déjà installée.
 */
export function InstallAppButton() {
  const t = useTranslations("pwa");
  const [mode, setMode] = useState<Mode>("hidden");
  const [deferred, setDeferred] = useState<InstallPrompt | null>(null);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    const timer = window.setTimeout(() => {
      if (isIos()) setMode("ios");
    }, 0);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as InstallPrompt);
      setMode("prompt");
    };
    const onInstalled = () => setMode("hidden");
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (mode === "hidden") return null;

  return (
    <section className="flex flex-col gap-3 lacquer rounded-card p-4">
      <h2 className="text-lg font-bold">{t("title")}</h2>
      <p className="text-sm text-text-muted">{t("body")}</p>
      <Button
        type="button"
        variant="primary"
        className="self-start"
        onClick={async () => {
          if (mode === "ios" || !deferred) {
            setHelp(true);
            return;
          }
          await deferred.prompt();
          const { outcome } = await deferred.userChoice;
          setDeferred(null);
          if (outcome === "accepted") setMode("hidden");
        }}
      >
        {t("install")}
      </Button>
      <Sheet open={help} onClose={() => setHelp(false)} title={t("iosTitle")}>
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
          <li>{t("iosStep1")}</li>
          <li>{t("iosStep2")}</li>
          <li>{t("iosStep3")}</li>
        </ol>
      </Sheet>
    </section>
  );
}
