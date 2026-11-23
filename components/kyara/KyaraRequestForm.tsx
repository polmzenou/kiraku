"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { requestKyaraImportAction, type KyaraImportActionError } from "@/server/actions/kyara-import";
import { Button } from "../ui/Button";

/** Demande d'import : un bouton, rien à coller ; l'équipe retrouve le profil Kyara par le compte Discord. */
export function KyaraRequestForm() {
  const t = useTranslations("kyaraImport.form");
  const tError = useTranslations("kyaraImport.errors");
  const [error, setError] = useState<KyaraImportActionError | null>(null);
  const [pending, start] = useTransition();

  const submit = () => {
    if (!window.confirm(t("confirm"))) return;
    setError(null);
    start(async () => {
      try {
        const res = await requestKyaraImportAction();
        if (!res.ok) setError(res.error);
      } catch {
        setError("UNAVAILABLE");
      }
    });
  };

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <p role="alert" className="text-sm font-bold text-shu">
          {tError(error)}
        </p>
      )}
      <Button type="button" variant="primary" disabled={pending} onClick={submit} className="w-full sm:w-fit">
        {pending ? t("pending") : t("submit")}
      </Button>
    </div>
  );
}
