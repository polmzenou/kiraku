"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { subscribePushAction, unsubscribePushAction } from "@/server/actions/push";
import { Button } from "../ui/Button";

type State = "loading" | "unsupported" | "needsInstall" | "denied" | "off" | "on";

const SW_URL = "/sw.js";

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = (value + "=".repeat((4 - (value.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function supported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** iPhone / iPad hors écran d'accueil : Safari n'y propose le Web Push qu'à une app installée. */
function iosBrowserTab() {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

async function currentSubscription() {
  const reg = await navigator.serviceWorker.getRegistration(SW_URL);
  return reg ? reg.pushManager.getSubscription() : null;
}

/**
 * Opt-in Web Push de ce navigateur. La permission n'est demandée qu'au clic sur « Activer »,
 * jamais au chargement ; le service worker n'est enregistré qu'à ce moment-là aussi.
 */
export function PushToggle({ publicKey }: { publicKey: string }) {
  const t = useTranslations("push");
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let next: State;
      if (!supported()) next = iosBrowserTab() ? "needsInstall" : "unsupported";
      else if (Notification.permission === "denied") next = "denied";
      else {
        const sub = Notification.permission === "granted" ? await currentSubscription().catch(() => null) : null;
        next = sub ? "on" : "off";
        // Déjà abonné : on resynchronise (clés renouvelées par le navigateur, langue de la page)
        if (sub) void subscribePushAction(sub.toJSON()).catch(() => undefined);
      }
      if (!cancelled) setState(next);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = () =>
    startTransition(async () => {
      setError(null);
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setState(permission === "denied" ? "denied" : "off");
          return;
        }
        const reg = await navigator.serviceWorker.register(SW_URL, { scope: "/" });
        await navigator.serviceWorker.ready;
        const sub =
          (await reg.pushManager.getSubscription()) ??
          (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(publicKey) }));
        const res = await subscribePushAction(sub.toJSON());
        if (!res.ok) {
          await sub.unsubscribe().catch(() => undefined);
          setError(t(`errors.${res.error}`));
          return;
        }
        setState("on");
      } catch {
        setError(t("errors.unexpected"));
      }
    });

  const disable = () =>
    startTransition(async () => {
      setError(null);
      try {
        const sub = await currentSubscription();
        if (sub) {
          await unsubscribePushAction({ endpoint: sub.endpoint });
          await sub.unsubscribe();
        }
        setState("off");
      } catch {
        setError(t("errors.unexpected"));
      }
    });

  return (
    <div className="flex flex-col gap-3" aria-busy={pending || state === "loading"}>
      <p className="text-sm text-text-muted">{t("intro")}</p>
      {state === "on" && (
        <>
          <p className="text-sm">{t("enabled")}</p>
          <Button type="button" onClick={disable} disabled={pending} className="w-full">
            {t("disable")}
          </Button>
        </>
      )}
      {state === "off" && (
        <Button type="button" variant="primary" onClick={enable} disabled={pending} className="w-full">
          {t("enable")}
        </Button>
      )}
      {state === "denied" && <p className="text-sm text-text-muted">{t("denied")}</p>}
      {state === "needsInstall" && <p className="text-sm text-text-muted">{t("needsInstall")}</p>}
      {state === "unsupported" && <p className="text-sm text-text-muted">{t("unsupported")}</p>}
      {error && (
        <p role="alert" className="text-sm text-shu">
          {error}
        </p>
      )}
    </div>
  );
}
