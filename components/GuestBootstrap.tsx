"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { oneTabAtATime } from "@/lib/account/guest-lock";
import { ensureGuest } from "@/server/actions/auth";
import { Button } from "./ui/Button";

/**
 * Crée le compte invité à la première visite. Déclenché côté client pour que
 * les robots sans JavaScript ne créent pas de comptes.
 */
export function GuestBootstrap() {
  const t = useTranslations("account");
  const started = useRef(false);
  const [failure, setFailure] = useState<"RATE_LIMITED" | "BANNED" | null>(null);
  const [pending, startTransition] = useTransition();

  const run = useCallback(() => {
    startTransition(async () => {
      // Le cookie de session posé par l'action fait re-rendre la page dans la même réponse. Un onglet à la fois : un
      // second onglet ouvert en même temps reprend l'invité du premier au lieu d'en créer un autre
      const result = await oneTabAtATime(() => ensureGuest());
      if (!result.ok) setFailure(result.error);
    });
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    run();
  }, [run]);

  if (!failure) {
    return (
      <p role="status" className="text-text-muted">
        {t("preparing")}
      </p>
    );
  }

  // Réseau banni : réessayer n'y changerait rien (l'écran du ban s'affiche au prochain chargement)
  if (failure === "BANNED") return <p role="alert">{t("networkBanned")}</p>;

  return (
    <div className="flex flex-col items-start gap-3">
      <p role="alert">{t("rateLimited")}</p>
      <Button onClick={run} disabled={pending}>
        {t("retry")}
      </Button>
    </div>
  );
}
