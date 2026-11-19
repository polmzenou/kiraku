"use client";

import { useTranslations } from "next-intl";
import { HoldButton } from "../ui/HoldButton";

/**
 * Départ « à la japonaise » : on maintient le bouton le temps que le pinceau le remplisse (doigt, souris
 * ou clavier, espace ou entrée). Évite un départ par erreur. Mouvement réduit : un appui arme le bouton,
 * un second confirme.
 */
export function HoldToLaunch({ label, disabled, pending, reduced, onLaunch }: { label: string; disabled: boolean; pending: boolean; reduced: boolean; onLaunch: () => void }) {
  const t = useTranslations("expedition.team");
  return (
    <HoldButton
      label={label}
      kanji="出発"
      pendingLabel={t("launching")}
      confirmLabel={t("confirmLaunch")}
      hint={t("holdHint")}
      disabled={disabled}
      pending={pending}
      reduced={reduced}
      onHold={onLaunch}
    />
  );
}
