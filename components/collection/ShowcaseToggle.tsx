"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Link } from "@/i18n/navigation";
import {
  addShowcaseCardsAction,
  removeShowcaseCardAction,
  showcasesForCardAction,
  type CardShowcaseOption,
} from "@/server/actions/showcases";
import { Button } from "../ui/Button";
import { Sheet } from "../ui/Sheet";
import { useCollectionStore } from "./CollectionStore";

/**
 * « Ajouter à une vitrine » depuis la fiche carte : ses vitrines à cocher (la même carte peut être dans
 * plusieurs), les vitrines pleines grisées, un lien pour en créer une depuis le profil.
 */
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
  const tShowcase = useTranslations("showcase");
  const { patch } = useCollectionStore();
  const [shown, setShown] = useState(inShowcase);
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<CardShowcaseOption[] | null>(null);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  const load = () => {
    setOpen(true);
    setError(false);
    startTransition(async () => {
      const res = await showcasesForCardAction({ cardId });
      if (!res.ok) {
        setError(true);
        return;
      }
      setOptions(res.showcases);
    });
  };

  const toggle = (option: CardShowcaseOption) =>
    startTransition(async () => {
      setError(false);
      const res = option.hasCard
        ? await removeShowcaseCardAction({ showcaseId: option.id, cardId })
        : await addShowcaseCardsAction({ showcaseId: option.id, cardIds: [cardId] });
      if (!res.ok) {
        setError(true);
        return;
      }
      const next = (options ?? []).map((o) =>
        o.id === option.id ? { ...o, hasCard: !o.hasCard, count: o.count + (o.hasCard ? -1 : 1) } : o,
      );
      setOptions(next);
      const now = next.some((o) => o.hasCard);
      setShown(now);
      patch(cardId, { inShowcase: now });
    });

  return (
    <>
      <Button type="button" onClick={load} disabled={!shown && !available} aria-haspopup="dialog">
        {shown ? t("inShowcases") : t("addToShowcase")}
      </Button>
      {open && (
        <Sheet open onClose={() => setOpen(false)} title={t("addToShowcase")}>
          {options === null ? (
            <p className="text-sm text-text-muted">{tShowcase("loading")}</p>
          ) : options.length === 0 ? (
            <p className="text-sm text-text-muted">
              {t.rich("noShowcase", {
                link: (chunks) => (
                  <Link href={profileHref} className="text-link underline underline-offset-4">
                    {chunks}
                  </Link>
                ),
              })}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {options.map((o, i) => {
                const full = !o.hasCard && o.count >= o.capacity;
                return (
                  <li key={o.id}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={o.hasCard}
                      disabled={pending || full}
                      onClick={() => toggle(o)}
                      className="flex min-h-11 w-full items-center justify-between gap-3 rounded-control border border-border bg-surface px-3 py-2 text-left disabled:opacity-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold">{o.name ?? tShowcase("untitled", { n: i + 1 })}</span>
                        <span className="block text-xs text-text-muted">
                          {full ? t("showcaseFullShort") : t("showcaseSlots", { count: o.count, capacity: o.capacity })}
                        </span>
                      </span>
                      <span aria-hidden="true" className={`flex size-6 shrink-0 items-center justify-center rounded-md border ${o.hasCard ? "border-shu bg-shu text-white" : "border-border"}`}>
                        {o.hasCard ? "✓" : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {error && (
            <p role="status" className="text-sm text-shu">
              {t("errors.UNAVAILABLE")}
            </p>
          )}
        </Sheet>
      )}
    </>
  );
}
