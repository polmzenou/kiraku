"use client";

import { useTranslations } from "next-intl";
import { useId, useState, type ReactNode } from "react";
import { segmentedItemClass, segmentedTrackClass } from "../ui/Segmented";

export type ShowcaseViewMode = "cards" | "fresco";

/**
 * Titre de la vitrine et sa mini-navigation « Cartes · Fresque », quand la vitrine a une fresque. Les deux
 * vues sont rendues par le serveur dans la même scène ; ce composant ne fait que montrer l'une ou l'autre
 * (onglets au clavier : flèches gauche et droite). `initial` suit le choix du propriétaire.
 */
export function ShowcaseViewSwitch({
  title,
  cards,
  fresco,
  initial = "cards",
}: {
  title: ReactNode;
  cards: ReactNode;
  fresco: ReactNode;
  initial?: ShowcaseViewMode;
}) {
  const t = useTranslations("fresco.view");
  const id = useId();
  const [mode, setMode] = useState<ShowcaseViewMode>(initial);
  const modes: ShowcaseViewMode[] = ["cards", "fresco"];
  const tab = (m: ShowcaseViewMode) => `${id}-tab-${m}`;
  const panel = (m: ShowcaseViewMode) => `${id}-panel-${m}`;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        {title}
        <div role="tablist" aria-label={t("label")} className={segmentedTrackClass}>
          {modes.map((m, i) => (
            <button
              key={m}
              id={tab(m)}
              type="button"
              role="tab"
              aria-selected={mode === m}
              aria-controls={panel(m)}
              tabIndex={mode === m ? 0 : -1}
              onClick={() => setMode(m)}
              onKeyDown={(e) => {
                if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                e.preventDefault();
                const next = modes[(i + (e.key === "ArrowRight" ? 1 : modes.length - 1)) % modes.length];
                setMode(next);
                document.getElementById(tab(next))?.focus();
              }}
              className={`${segmentedItemClass} min-h-11`}
            >
              {m === "fresco" && (
                <span aria-hidden="true" lang="ja" className="font-seal">
                  絵
                </span>
              )}
              {t(m)}
            </button>
          ))}
        </div>
      </div>
      <div id={panel("cards")} role="tabpanel" aria-labelledby={tab("cards")} hidden={mode !== "cards"} className="flex flex-col gap-3">
        {cards}
      </div>
      <div id={panel("fresco")} role="tabpanel" aria-labelledby={tab("fresco")} hidden={mode !== "fresco"} className="flex flex-col gap-3">
        {fresco}
      </div>
    </>
  );
}
