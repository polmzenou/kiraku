"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Fuda } from "@/components/fuda/Fuda";
import { sameKit } from "@/lib/battle/loadout";
import type { WorkshopCard } from "@/lib/battle/view";
import { AbilityWorkshop, type WorkshopRules } from "./AbilityWorkshop";
import { CardFilters, useCardFilters } from "./CardFilters";

/** Page de l'atelier : toutes les cartes du joueur, avec la recherche et les filtres du choix d'équipe. */
export function WorkshopBrowser({
  cards,
  coins,
  rules,
  initialCardId,
}: {
  cards: WorkshopCard[];
  coins: number;
  rules: WorkshopRules;
  /** Carte à ouvrir d'entrée (lien « Modifier » de la collection). */
  initialCardId: string | null;
}) {
  const t = useTranslations("battle.atelier");
  const tt = useTranslations("battle.team");
  const tk = useTranslations("battle");
  const [openId, setOpenId] = useState<string | null>(() => (initialCardId && cards.some((c) => c.cardId === initialCardId) ? initialCardId : null));
  const filters = useCardFilters(cards);
  const open = openId ? cards.find((c) => c.cardId === openId) : undefined;

  const close = () => {
    setOpenId(null);
    // ?carte= rouvrirait la feuille au rechargement
    if (initialCardId) window.history.replaceState(null, "", window.location.pathname);
  };

  if (cards.length === 0) return <p className="lacquer rounded-card p-4 text-center text-sm text-text-muted">{t("empty")}</p>;

  return (
    <div className="flex flex-col gap-4">
      <CardFilters filters={filters} universe={false} />

      {filters.shown.length === 0 ? (
        <p className="text-center text-sm text-text-muted">{tt("noMatch")}</p>
      ) : (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6">
          {filters.shown.map((c) => {
            const modified = !sameKit({ keywords: c.keywords, technique: c.technique }, c.base);
            return (
              <li key={c.cardId}>
                <button
                  type="button"
                  onClick={() => setOpenId(c.cardId)}
                  aria-label={t("open", { name: c.name })}
                  className="relative flex w-full flex-col gap-1 rounded-[6px] text-left active:scale-[.98] motion-reduce:transition-none"
                >
                  <Fuda card={c} size="sm" variant="battle" tilt={false} sizes="(min-width: 768px) 160px, 30vw" />
                  <span className="flex flex-wrap items-center gap-1 text-[11px] leading-tight">
                    <span className="text-shu">{tk(`techniques.${c.technique}.name`)}</span>
                    {c.keywords.map((k) => (
                      <span key={k} className="rounded-sm bg-surface-2 px-0.5">
                        {tk(`keywords.${k}.name`)}
                      </span>
                    ))}
                  </span>
                  {modified && (
                    <span className="absolute top-1 left-1 rounded-full bg-kin px-1.5 py-0.5 text-[10px] font-bold text-sumi">{t("modified")}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {open && <AbilityWorkshop key={open.cardId} card={open} coins={coins} rules={rules} onClose={close} />}
    </div>
  );
}
