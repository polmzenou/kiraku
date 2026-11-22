"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { prepareKyaraProcessingAction, type KyaraStaffError } from "@/server/actions/admin-kyara";
import { Button } from "../../ui/Button";

/**
 * « Traiter » : prépare un lien à usage unique vers le profil Kyara du joueur (#kiraku=<code>), puis l'affiche à
 * ouvrir (une fenêtre ouverte après une requête serait bloquée). Sur Kyara, le favori lit la collection.
 */
export function KyaraProcessButton({ importId }: { importId: string }) {
  const t = useTranslations("admin.kyara.queue");
  const tError = useTranslations("admin.kyara.errors");
  const format = useFormatter();
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [error, setError] = useState<KyaraStaffError | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await prepareKyaraProcessingAction({ importId });
            if (res.ok) setLink({ url: res.url, expiresAt: res.expiresAt });
            else setError(res.error);
          })
        }
      >
        {link ? t("processAgain") : t("process")}
      </Button>
      {link && (
        <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-ai underline underline-offset-4">
          {t("openOnKyara", { time: format.dateTime(new Date(link.expiresAt), { timeStyle: "short" }) })}
        </a>
      )}
      {error && (
        <p role="alert" className="text-xs font-bold text-shu">
          {tError(error)}
        </p>
      )}
    </div>
  );
}
