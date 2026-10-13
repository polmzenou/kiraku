"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { ensureGuest } from "@/server/actions/auth";
import { Button } from "./ui/Button";

/**
 * Crée le compte invité à la première visite. Déclenché côté client pour que
 * les robots sans JavaScript ne créent pas de comptes.
 */
export function GuestBootstrap() {
  const t = useTranslations("account");
  const router = useRouter();
  const started = useRef(false);
  const [limited, setLimited] = useState(false);
  const [pending, startTransition] = useTransition();

  const run = useCallback(() => {
    startTransition(async () => {
      const result = await ensureGuest();
      if (result.ok) router.refresh();
      else setLimited(true);
    });
  }, [router]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    run();
  }, [run]);

  if (!limited) {
    return (
      <p role="status" className="text-text-muted">
        {t("preparing")}
      </p>
    );
  }

  return (
    <div className="flex flex-col items-start gap-3">
      <p role="alert">{t("rateLimited")}</p>
      <Button onClick={run} disabled={pending}>
        {t("retry")}
      </Button>
    </div>
  );
}
