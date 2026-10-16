"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { cancelDeletionAction, requestDeletionAction, type DataActionError } from "@/server/actions/data";
import { Button } from "../ui/Button";
import { Sheet } from "../ui/Sheet";

/** Suppression du compte : demande confirmée par le pseudo, annulable jusqu'à l'échéance. */
export function DeletionPanel({ username, graceDays, dueAt }: { username: string; graceDays: number; dueAt: string | null }) {
  const t = useTranslations("data");
  const format = useFormatter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const errorText = (code: DataActionError) =>
    code === "CONFIRM_MISMATCH" || code === "ALREADY_REQUESTED" || code === "NOT_REQUESTED" || code === "RATE_LIMITED" || code === "FROZEN"
      ? t(`errors.${code}`)
      : t("errors.GENERIC");

  if (dueAt) {
    return (
      <div className="flex flex-col gap-3">
        <p className="font-bold text-shu">{t("deletion.pendingTitle")}</p>
        <p className="text-sm">{t("deletion.pendingBody", { date: format.dateTime(new Date(dueAt), { dateStyle: "long" }) })}</p>
        {error && (
          <p role="alert" className="text-sm text-shu">
            {error}
          </p>
        )}
        <Button
          type="button"
          variant="shu"
          disabled={pending}
          className="self-start"
          onClick={() =>
            startTransition(async () => {
              const r = await cancelDeletionAction();
              setError(r.ok ? null : errorText(r.error));
            })
          }
        >
          {t("deletion.cancel")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-text-muted">{t("deletion.body", { days: graceDays })}</p>
      <p className="text-sm text-text-muted">{t("deletion.freeze")}</p>
      <Button type="button" className="self-start border-shu text-shu" onClick={() => setOpen(true)}>
        {t("deletion.open")}
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t("deletion.title")}>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const r = await requestDeletionAction({ confirm });
              if (r.ok) {
                setOpen(false);
                setError(null);
              } else setError(errorText(r.error));
            });
          }}
        >
          <p className="text-sm">{t("deletion.body", { days: graceDays })}</p>
          <label htmlFor="delete-confirm" className="text-sm font-medium">
            {t("deletion.confirmLabel", { username })}
          </label>
          <input
            id="delete-confirm"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={40}
            className="min-h-11 rounded-button border border-border bg-surface px-3"
          />
          {error && (
            <p role="alert" className="text-sm text-shu">
              {error}
            </p>
          )}
          <Button type="submit" variant="shu" disabled={pending || confirm.trim().toLowerCase() !== username.toLowerCase()}>
            {t("deletion.submit")}
          </Button>
        </form>
      </Sheet>
    </div>
  );
}
