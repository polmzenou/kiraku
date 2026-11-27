"use client";

import { useTranslations } from "next-intl";
import { useDeferredValue, useId, useState } from "react";
import type { SpoilerResult } from "@/server/actions/spoiler";
import { resetSpoilerUniversesAction, setSpoilerUniverseAction } from "@/server/actions/spoiler";
import type { SpoilerUniverse } from "@/lib/spoiler";
import { Button } from "../ui/Button";
import { Switch } from "../ui/Choice";
import { inputClass } from "../ui/Field";
import { useSpoilerPreference } from "./SpoilerPreference";

/** Recherche sans accents ni casse (« pokemon » trouve « Pokémon »). */
const fold = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

type ErrorCode = Exclude<SpoilerResult, { ok: true }>["error"] | "UNEXPECTED";

/**
 * Univers qui ont des cartes spoil, chacun flouté par défaut : décocher remet ses cartes en clair. Appliqué tout de
 * suite et enregistré sur le compte ; un échec rétablit l'interrupteur. Grisé en « Tout afficher ».
 */
export function SpoilerUniverseList({ universes }: { universes: SpoilerUniverse[] }) {
  const t = useTranslations("spoiler.universes");
  const searchId = useId();
  const { prefs, setPrefs } = useSpoilerPreference();
  const [query, setQuery] = useState("");
  const [error, setError] = useState<ErrorCode | null>(null);
  const deferred = useDeferredValue(query);
  const needle = fold(deferred.trim());
  const visible = needle ? universes.filter((u) => fold(u.name).includes(needle)) : universes;
  const known = new Set(universes.map((u) => u.key));
  const shownCount = prefs.shown.filter((key) => known.has(key)).length;

  async function toggle(key: string, blurred: boolean) {
    const shown = !blurred;
    const apply = (on: boolean) => setPrefs((p) => ({ ...p, shown: on ? [...p.shown.filter((k) => k !== key), key] : p.shown.filter((k) => k !== key) }));
    setError(null);
    apply(shown);
    const result = await setSpoilerUniverseAction({ key, shown }).catch(() => null);
    if (!result?.ok) {
      apply(!shown);
      setError(result ? result.error : "UNEXPECTED");
    }
  }

  async function reset() {
    const before = prefs.shown;
    setError(null);
    setPrefs((p) => ({ ...p, shown: [] }));
    const result = await resetSpoilerUniversesAction().catch(() => null);
    if (!result?.ok) {
      setPrefs((p) => ({ ...p, shown: before }));
      setError(result ? result.error : "UNEXPECTED");
    }
  }

  if (universes.length === 0) return <p className="text-sm text-text-muted">{t("empty")}</p>;

  return (
    <div className="flex flex-col gap-4">
      {!prefs.blur && (
        <p role="note" className="rounded-control border border-kin/60 bg-kin/10 px-3 py-2.5 text-sm">
          {t("showAllActive")}
        </p>
      )}
      <div className="flex flex-col gap-1">
        <label htmlFor={searchId} className="text-sm text-text-muted">
          {t("search")}
        </label>
        <input id={searchId} type="search" value={query} onChange={(e) => setQuery(e.target.value)} maxLength={80} autoComplete="off" className={inputClass} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-text-muted" aria-live="polite">
          {t("summary", { shown: shownCount, total: universes.length })}
        </p>
        {shownCount > 0 && (
          <Button type="button" size="sm" onClick={reset} disabled={!prefs.blur}>
            {t("reset")}
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-shu">
          {t(`errors.${error}`)}
        </p>
      )}
      <fieldset disabled={!prefs.blur} className="min-w-0 disabled:opacity-60">
        <legend className="sr-only">{t("legend")}</legend>
        {visible.length === 0 ? (
          <p className="text-sm text-text-muted">{t("noMatch")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border lacquer rounded-card">
            {visible.map((universe) => {
              const blurred = !prefs.shown.includes(universe.key);
              return (
                <li key={universe.key}>
                  <label className="flex min-h-14 cursor-pointer items-center gap-3 px-4 py-2">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-bold">{universe.name}</span>
                      <span className="text-xs text-text-muted tabular-nums">
                        {t("cards", { count: universe.cards })} · {blurred ? t("blurred") : t("shown")}
                      </span>
                    </span>
                    <Switch checked={blurred} onChange={() => toggle(universe.key, !blurred)} aria-label={t("switchLabel", { name: universe.name })} />
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </fieldset>
    </div>
  );
}
