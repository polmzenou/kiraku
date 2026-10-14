"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { attachReferralAction, type EconomyActionError } from "@/server/actions/economy";
import { Button } from "../ui/Button";

/** Saisie du code d'un parrain (prérempli si le joueur est arrivé par un lien d'invitation). */
export function ReferralCodeForm({ initialCode }: { initialCode: string }) {
  const t = useTranslations("economy");
  const [code, setCode] = useState(initialCode);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<EconomyActionError | "unexpected" | null>(null);
  const [done, setDone] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      setError(null);
      try {
        const res = await attachReferralAction({ code });
        if (res.ok) setDone(true);
        else setError(res.error);
      } catch {
        setError("unexpected");
      }
    });
  };

  if (done) {
    return (
      <p className="text-sm font-bold text-kin" role="status">
        {t("referral.attached")}
      </p>
    );
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <label htmlFor="referral-code" className="text-sm text-text-muted">
        {t("referral.enterCode")}
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id="referral-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          maxLength={32}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className="min-h-11 min-w-0 flex-1 rounded-button border border-border bg-surface-2 px-3 font-bold tracking-[0.15em] uppercase"
        />
        <Button type="submit" disabled={pending || code.trim().length === 0}>
          {t("referral.attach")}
        </Button>
      </div>
      {error && (
        <p className="text-sm text-shu" role="alert">
          {t(`errors.${error}`)}
        </p>
      )}
    </form>
  );
}
