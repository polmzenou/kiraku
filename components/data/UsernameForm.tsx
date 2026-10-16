"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { changeUsernameAction, type DataActionError } from "@/server/actions/data";
import { Button } from "../ui/Button";

/** Changement de pseudo (droit de rectification), avec le délai réglé dans l'admin. */
export function UsernameForm({ current, cooldownDays }: { current: string; cooldownDays: number }) {
  const t = useTranslations("data");
  const [value, setValue] = useState(current);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await changeUsernameAction({ username: value });
      if (result.ok) setMessage({ ok: true, text: t("rectify.saved") });
      else setMessage({ ok: false, text: errorText(result.error) });
    });
  }

  function errorText(code: DataActionError) {
    switch (code) {
      case "INVALID":
      case "USERNAME_TAKEN":
      case "TOO_SOON":
      case "RATE_LIMITED":
      case "FROZEN":
        return t(`errors.${code}`);
      default:
        return t("errors.GENERIC");
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2" noValidate>
      <label htmlFor="username" className="text-sm font-medium">
        {t("rectify.username")}
      </label>
      <input
        id="username"
        name="username"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        minLength={3}
        maxLength={20}
        pattern="[A-Za-z0-9_\-]{3,20}"
        aria-describedby="username-hint"
        className="min-h-11 rounded-button border border-border bg-bg px-3"
      />
      <p id="username-hint" className="text-xs text-text-muted">
        {t("rectify.usernameHint")} · {t("rectify.cooldown", { days: cooldownDays })}
      </p>
      {message && (
        <p role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-text-muted" : "text-shu"}`}>
          {message.text}
        </p>
      )}
      <Button type="submit" disabled={pending || value.trim() === current} className="self-start">
        {t("rectify.submit")}
      </Button>
    </form>
  );
}
