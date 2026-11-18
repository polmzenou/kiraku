"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { recycleCopyAction } from "@/server/actions/collection";
import { Button } from "../ui/Button";

/**
 * Recyclage d'un exemplaire spécial (héritier ou gravé), depuis sa ligne de la fiche : une première pression
 * annonce ce qui disparaît et le gain, la seconde confirme. Le serveur relit l'exemplaire et le gain sous verrou.
 */
export function RecycleCopyButton({ userCardId, gain, engraved }: { userCardId: string; gain: number; engraved: boolean }) {
  const t = useTranslations("collection.card");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const recycle = () =>
    startTransition(async () => {
      try {
        const res = await recycleCopyAction({ userCardId, expected: gain });
        setConfirming(false);
        // Réussite : la fiche est rafraîchie par le serveur, la ligne disparaît
        if (!res.ok) setError(t(`errors.${res.error}`));
      } catch {
        setError(t("errors.UNAVAILABLE"));
      }
    });

  if (!confirming) {
    return (
      <div className="flex flex-col gap-1">
        <Button type="button" size="sm" onClick={() => { setConfirming(true); setError(null); }} disabled={pending}>
          {t("recycleCopy")}
        </Button>
        {error && <p role="status" className="text-sm text-shu">{error}</p>}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm">{t(engraved ? "recycleCopyEngraved" : "recycleCopyHeir")}</p>
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" size="sm" onClick={() => setConfirming(false)} disabled={pending}>
          {t("cancel")}
        </Button>
        <Button type="button" size="sm" variant="primary" onClick={recycle} disabled={pending}>
          {t("confirm", { zeni: gain })}
        </Button>
      </div>
    </div>
  );
}
