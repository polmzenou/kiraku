"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Link } from "@/i18n/navigation";
import { addToShowcaseAction, removeFromShowcaseAction } from "@/server/actions/collection";
import { Button } from "../ui/Button";
import { useCollectionStore } from "./CollectionStore";

/** « Mettre en vitrine » / « Retirer de la vitrine » depuis la fiche carte. */
export function ShowcaseToggle({
  cardId,
  inShowcase,
  available,
  profileHref,
}: {
  cardId: string;
  inShowcase: boolean;
  /** Au moins un exemplaire en collection (pas en vente ni en combat). */
  available: boolean;
  profileHref: string;
}) {
  const t = useTranslations("collection.card");
  const { patch } = useCollectionStore();
  const [shown, setShown] = useState(inShowcase);
  const [error, setError] = useState<"FULL" | "OTHER" | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = () =>
    startTransition(async () => {
      setError(null);
      try {
        const res = shown ? await removeFromShowcaseAction({ cardId }) : await addToShowcaseAction({ cardId });
        if (!res.ok) {
          setError(res.error === "FULL" ? "FULL" : "OTHER");
          return;
        }
        const now = res.slots.includes(cardId);
        setShown(now);
        patch(cardId, { inShowcase: now });
      } catch {
        setError("OTHER");
      }
    });

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" onClick={toggle} disabled={pending || (!shown && !available)} aria-pressed={shown}>
        {shown ? t("removeFromShowcase") : t("addToShowcase")}
      </Button>
      {error === "FULL" && (
        <p role="status" className="text-sm text-shu">
          {t.rich("showcaseFull", {
            link: (chunks) => (
              <Link href={profileHref} className="text-link underline underline-offset-4">
                {chunks}
              </Link>
            ),
          })}
        </p>
      )}
      {error === "OTHER" && (
        <p role="status" className="text-sm text-shu">
          {t("errors.UNAVAILABLE")}
        </p>
      )}
    </div>
  );
}
