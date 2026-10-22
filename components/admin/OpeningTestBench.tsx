"use client";

import { useTranslations } from "next-intl";
import { useCallback, useId, useRef, useState } from "react";
import { OPENING_TEST_SCENARIOS, testBoosters, type OpeningTestPool, type OpeningTestScenario } from "@/lib/admin/opening-test";
import type { OpenBoosterResult } from "@/server/actions/boosters";
import type { BoosterState } from "@/server/boosters/state";
import { OpeningStage, type OpeningType } from "../opening/OpeningStage";

const input = "min-h-11 w-full min-w-0 rounded-control border border-border bg-surface-2 px-3 text-base";

/**
 * Banc de test de l'ouverture : le vrai rituel (booster, pile, aurore, récap) branché sur un tirage
 * factice construit ici. Rien n'est envoyé au serveur ni enregistré : ni Zeni, ni carte.
 */
export function OpeningTestBench({ types, pool, initialState }: { types: OpeningType[]; pool: OpeningTestPool; initialState: BoosterState }) {
  const t = useTranslations("admin.openingTest");
  const id = useId();
  const [slug, setSlug] = useState(types[0]?.slug ?? "");
  const [scenario, setScenario] = useState<OpeningTestScenario>("all");
  const run = useRef(0);
  const type = types.find((x) => x.slug === slug) ?? types[0];

  const open = useCallback(
    async (request: unknown): Promise<OpenBoosterResult> => {
      const count = typeof request === "object" && request !== null && "count" in request && typeof request.count === "number" ? request.count : 1;
      // Petit délai : la lumière de la fente a le temps de partir comme avec le serveur
      await new Promise((resolve) => setTimeout(resolve, 250));
      run.current += 1;
      const boosters = testBoosters({ pool, scenario, count, cardsPerBooster: type?.cards ?? 5, run: run.current });
      return { ok: true, boosters, state: initialState, featuredCount: 0, zeniSpent: 0, credits: 0 };
    },
    [pool, scenario, type?.cards, initialState],
  );

  if (!type) return null;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] md:items-end">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-booster`} className="text-sm font-bold">
            {t("booster")}
          </label>
          <select id={`${id}-booster`} className={input} value={type.slug} onChange={(e) => setSlug(e.target.value)}>
            {types.map((x) => (
              <option key={x.slug} value={x.slug}>
                {x.name}
              </option>
            ))}
          </select>
        </div>
        <fieldset className="flex min-w-0 flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-bold">{t("scenario")}</legend>
          <div className="flex flex-wrap gap-2">
            {OPENING_TEST_SCENARIOS.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={s === scenario}
                onClick={() => setScenario(s)}
                className="inline-flex min-h-11 items-center rounded-pill border border-border bg-surface px-4 text-sm font-bold text-text-muted aria-pressed:border-shu aria-pressed:bg-shu/15 aria-pressed:text-text"
              >
                {t(`scenarios.${s}`)}
              </button>
            ))}
          </div>
        </fieldset>
      </div>
      <p className="text-xs text-text-muted">{t("hint")}</p>

      {/* Nouvelle scène à chaque changement de booster ou de scénario */}
      <OpeningStage key={`${type.slug}-${scenario}`} type={type} initialState={initialState} isGuest={false} open={open} />
    </div>
  );
}
