"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { closeSeasonAction } from "@/server/actions/admin-ranked";
import { Button } from "../ui/Button";
import { Sheet } from "../ui/Sheet";

/** Clôture anticipée de la saison affichée, après confirmation. */
export function CloseSeasonButton({ number }: { number: number }) {
  const t = useTranslations("admin.ranked");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button onClick={() => setOpen(true)}>{t("close")}</Button>
      {message && <p role="status" className="text-sm text-text-muted">{message}</p>}
      <Sheet open={open} onClose={() => setOpen(false)} title={t("close")}>
        <p className="text-sm">{t("closeConfirm", { number })}</p>
        <div className="flex justify-end gap-2">
          <Button onClick={() => setOpen(false)}>{t("cancel")}</Button>
          <Button
            variant="shu"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await closeSeasonAction({ number });
                setOpen(false);
                setMessage(res.ok ? t("closed", { number: res.number, count: res.results }) : t(`errors.${res.error === "STALE" ? "INVALID" : res.error === "FORBIDDEN" ? "FORBIDDEN" : res.error === "RATE_LIMITED" ? "RATE_LIMITED" : "UNAVAILABLE"}`));
                router.refresh();
              })
            }
          >
            {t("closeYes")}
          </Button>
        </div>
      </Sheet>
    </>
  );
}
