"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useTransition } from "react";
import { buttonClasses } from "@/components/ui/Button";
import { useRouter } from "@/i18n/navigation";
import { SEARCH_MAX_LENGTH } from "@/lib/catalog/search";
import { wikiQuery, type WikiOwnership } from "@/lib/catalog/wiki-params";
import type { Rarity } from "@/lib/catalog/rarity";

const DEBOUNCE_MS = 300;

/**
 * Recherche du wiki : met l'URL à jour pendant la frappe (le serveur fait la recherche).
 * Sans JavaScript, le formulaire GET fonctionne tel quel.
 */
export function WikiSearch({ initialQuery, rarity, ownership, action }: { initialQuery: string; rarity: Rarity | null; ownership: WikiOwnership; action: string }) {
  const t = useTranslations("wiki");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  function search(q: string) {
    clearTimeout(timer.current);
    startTransition(() => {
      router.replace({ pathname: "/wiki", query: wikiQuery({ q: q.trim(), rarity, ownership }) }, { scroll: false });
    });
  }

  return (
    <form
      role="search"
      action={action}
      method="get"
      onSubmit={(e) => {
        e.preventDefault();
        search(String(new FormData(e.currentTarget).get("q") ?? ""));
      }}
      className="flex gap-2"
    >
      <label htmlFor="wiki-q" className="sr-only">
        {t("searchLabel")}
      </label>
      <input
        id="wiki-q"
        name="q"
        type="search"
        defaultValue={initialQuery}
        maxLength={SEARCH_MAX_LENGTH}
        placeholder={t("searchPlaceholder")}
        autoComplete="off"
        enterKeyHint="search"
        onChange={(e) => {
          const value = e.currentTarget.value;
          clearTimeout(timer.current);
          timer.current = setTimeout(() => search(value), DEBOUNCE_MS);
        }}
        className="min-h-11 min-w-0 flex-1 rounded-button border border-border bg-surface px-3 text-text placeholder:text-text-muted"
      />
      {rarity && <input type="hidden" name="rarity" value={rarity} />}
      {ownership !== "all" && <input type="hidden" name="ownership" value={ownership} />}
      <button type="submit" aria-busy={pending} className={buttonClasses("neutral", "px-4")}>
        {t("searchSubmit")}
      </button>
    </form>
  );
}
