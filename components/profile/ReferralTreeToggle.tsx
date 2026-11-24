"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { setReferralTreeHiddenAction } from "@/server/actions/profile";
import { Button } from "../ui/Button";

/** Masquer ou montrer son arbre des liens aux autres joueurs (son propre profil). */
export function ReferralTreeToggle({ hidden }: { hidden: boolean }) {
  const t = useTranslations("profile.tree");
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <span className="inline-flex items-center gap-2">
      {error && (
        <span role="alert" className="text-xs text-shu">
          {t("error")}
        </span>
      )}
      <Button
        type="button"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await setReferralTreeHiddenAction({ hidden: !hidden });
            setError(!res.ok);
          })
        }
      >
        {hidden ? t("show") : t("hide")}
      </Button>
    </span>
  );
}
