"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { CardBack } from "./CardBack";
import { FudaTilt } from "./FudaTilt";
import "./FudaTurnover.css";

/** Même dos que l'ouverture ; les fiches gardent leur recto et leur contenu serveur. */
export function FudaTurnover({ children, className = "" }: { children: ReactNode; className?: string }) {
  const t = useTranslations("cardBack");
  const [back, setBack] = useState(false);
  return (
    <div className={className}>
      <div className="kf-scene">
        <div className="kf-turn" data-back={back}>
          <div className="kf-front" aria-hidden={back} inert={back}>
            <FudaTilt>{children}</FudaTilt>
          </div>
          <div className="kf-reverse" aria-hidden={!back} inert={!back}>
            <CardBack static={!back} />
            <span className="sr-only">{t("description")}</span>
          </div>
        </div>
      </div>
      <button type="button" onClick={() => setBack(!back)} aria-pressed={back} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-button border border-border bg-surface px-3 text-sm text-text hover:border-kin">
        <span aria-hidden="true">↻</span>{back ? t("showFront") : t("showBack")}
      </button>
    </div>
  );
}
