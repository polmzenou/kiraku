"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { reorderShowcasesAction } from "@/server/actions/showcases";
import { Button } from "../ui/Button";

/**
 * Fait d'une vitrine la vitrine principale : la seule affichée sur le profil et visible par les autres
 * joueurs (les autres restent privées, en accès rapide pour leur propriétaire).
 */
export function MakeMainButton({ id, showcaseIds, short = false }: { id: string; showcaseIds: readonly string[]; short?: boolean }) {
  const t = useTranslations("showcase");
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const make = () =>
    startTransition(async () => {
      setFailed(false);
      const res = await reorderShowcasesAction({ ids: [id, ...showcaseIds.filter((other) => other !== id)] });
      if (!res.ok) {
        setFailed(true);
        return;
      }
      router.refresh();
    });
  return (
    <span className="inline-flex flex-col gap-1">
      <Button type="button" size={short ? "sm" : "md"} onClick={make} disabled={pending} aria-label={short ? t("makeMain") : undefined}>
        {short ? t("makeMainShort") : t("makeMain")}
      </Button>
      {failed && (
        <span role="status" className="text-xs text-shu">
          {t("errors.UNAVAILABLE")}
        </span>
      )}
    </span>
  );
}
