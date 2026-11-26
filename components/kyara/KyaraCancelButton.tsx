"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { cancelKyaraImportAction, type KyaraImportActionError } from "@/server/actions/kyara-import";
import { Button } from "../ui/Button";

/**
 * Annule une demande encore en attente (avant la lecture par l'équipe). `windowClosed` : la fenêtre du joueur est
 * passée (la demande, faite à temps, reste traitable) ; l'avertissement dit qu'aucune autre demande ne sera possible.
 */
export function KyaraCancelButton({ importId, windowClosed }: { importId: string; windowClosed: boolean }) {
  const t = useTranslations("kyaraImport.cancel");
  const tError = useTranslations("kyaraImport.errors");
  const [error, setError] = useState<KyaraImportActionError | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(t(windowClosed ? "confirmClosed" : "confirm"))) return;
          setError(null);
          start(async () => {
            try {
              const res = await cancelKyaraImportAction({ importId });
              if (!res.ok) setError(res.error);
            } catch {
              setError("UNAVAILABLE");
            }
          });
        }}
        className="w-full sm:w-fit"
      >
        {pending ? t("pending") : t("button")}
      </Button>
      {error && (
        <p role="alert" className="text-sm font-bold text-shu">
          {tError(error)}
        </p>
      )}
    </div>
  );
}
