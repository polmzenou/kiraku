"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { setWishlistAction, type WishlistActionError } from "@/server/actions/wishlist";
import { Button } from "../ui/Button";

export function WishlistToggle({ cardId, name, initial, compact = false }: { cardId: string; name: string; initial: boolean; compact?: boolean }) {
  const t = useTranslations("wishlist");
  const [wished, setWished] = useState(initial);
  const [rendered, setRendered] = useState(initial);
  const [error, setError] = useState<WishlistActionError | null>(null);
  const [pending, startTransition] = useTransition();
  if (rendered !== initial) {
    setRendered(initial);
    setWished(initial);
  }

  const toggle = () => startTransition(async () => {
    setError(null);
    try {
      const result = await setWishlistAction({ cardId, wished: !wished });
      if (result.ok) setWished(result.wished);
      else setError(result.error);
    } catch {
      setError("UNAVAILABLE");
    }
  });

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" onClick={toggle} disabled={pending} aria-pressed={wished} aria-label={t(wished ? "removeNamed" : "addNamed", { name })} className={compact ? "w-full px-1 text-xs" : "w-fit"}>
        <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill={wished ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
          <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />
        </svg>
        <span className={compact ? "hidden sm:inline" : undefined}>{t(compact ? "removeShort" : wished ? "remove" : "add")}</span>
      </Button>
      {error && <p role="status" className="text-sm text-shu">{t(`errors.${error}`)}</p>}
    </div>
  );
}
