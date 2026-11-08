"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { wishCardsAction } from "@/server/actions/wishlist";
import { Button } from "../ui/Button";

/** Ajoute à sa liste de souhaits les cartes d'une vitrine qu'on n'a pas encore. */
export function WishMissingButton({ cardIds }: { cardIds: readonly string[] }) {
  const t = useTranslations("showcase");
  const [result, setResult] = useState<"done" | "full" | "error" | null>(null);
  const [pending, startTransition] = useTransition();

  const wish = () =>
    startTransition(async () => {
      const res = await wishCardsAction({ cardIds: cardIds.slice(0, 20) });
      setResult(!res.ok ? "error" : res.full ? "full" : "done");
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" onClick={wish} disabled={pending || result === "done"}>
        {t("visitor.wishAll", { count: cardIds.length })}
      </Button>
      <span role="status" aria-live="polite" className="text-sm text-text-muted">
        {result === "done" ? t("visitor.wished") : result === "full" ? t("visitor.wishFull") : result === "error" ? t("visitor.wishError") : ""}
      </span>
    </div>
  );
}
