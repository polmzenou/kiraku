"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import type { EndReason, Side } from "@/lib/battle/types";
import { requeueAction } from "@/server/actions/battle";
import { ZeniCoin } from "../layout/ZeniCoin";
import { Button, buttonClasses } from "../ui/Button";
import { useBattleError } from "./useBattleError";

// Action qui lève (serveur injoignable, panne) : erreur traduite au lieu d'un écran d'erreur
const UNAVAILABLE = { ok: false, error: "UNAVAILABLE", battleId: undefined } as const;

/**
 * Écran de fin : sceau de victoire ou de défaite, raison, Zeni gagnés, puis relancer, nouveau combat ou revoir.
 * Un vrai dialogue modal (<dialog> natif : focus sur le titre, Tab gardé dedans) ; Échap ou « Voir le plateau »
 * le referme pour regarder la table finale (`onDismiss`), le parent offre de le rouvrir.
 */
export function BattleResult({
  winner,
  mySide,
  reason,
  rewardZeni,
  onReplay,
  onDismiss,
  requeueId,
  ranked,
}: {
  winner: Side | null;
  mySide: Side;
  reason: EndReason | null;
  rewardZeni: number;
  onReplay?: () => void;
  onDismiss: () => void;
  /** Partie de file (exhibition, classé) : « Relancer » remet en file avec le même mode et les mêmes cartes. */
  requeueId?: string;
  /** Bilan classé (emblème, PC) sous le résultat. */
  ranked?: ReactNode;
}) {
  const t = useTranslations("battle.result");
  const router = useRouter();
  const errorText = useBattleError();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const outcome = winner === null ? "DRAW" : winner === mySide ? "WIN" : "LOSS";
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (!el.open) el.showModal();
    title.current?.focus();
    return () => el.close();
  }, []);

  const requeue = () =>
    startTransition(async () => {
      if (!requeueId) return;
      setError(null);
      const res = await requeueAction({ battleId: requeueId }).catch(() => UNAVAILABLE);
      if (!res.ok) {
        if (res.error === "IN_BATTLE" && res.battleId) return router.push(`/combat/${res.battleId}`);
        return setError(errorText(res.error));
      }
      // En file : l'accueil du combat affiche l'attente
      router.push(res.state === "MATCHED" ? `/combat/${res.battleId}` : "/combat");
    });

  return (
    <dialog
      ref={dialog}
      aria-labelledby="battle-result-title"
      // Échap : le bilan s'efface devant le plateau (le parent le démonte)
      onCancel={(e) => {
        e.preventDefault();
        onDismiss();
      }}
      className="fixed inset-x-4 top-auto bottom-4 mx-auto my-0 max-h-[calc(100dvh-2rem)] w-auto max-w-sm overflow-y-auto border-0 bg-transparent p-0 text-text backdrop:bg-black/60 sm:inset-0 sm:m-auto sm:h-fit sm:w-full"
    >
      <div className="flex w-full flex-col items-center gap-4 rounded-2xl border border-border bg-bg p-6 text-center">
        <h2
          ref={title}
          id="battle-result-title"
          tabIndex={-1}
          className={`flex min-h-24 rotate-[-6deg] items-center justify-center rounded-md border-4 px-4 py-3 font-heading text-3xl font-extrabold outline-none ${
            outcome === "WIN" ? "border-kin text-kin" : outcome === "LOSS" ? "border-shu text-shu" : "border-border text-text-muted"
          }`}
        >
          {t(outcome)}
        </h2>
        {reason && <p className="text-sm text-text-muted">{t(reason === "KO" && outcome === "LOSS" ? "reason.KO_LOSS" : `reason.${reason}`)}</p>}
        {ranked}
        {outcome === "WIN" && rewardZeni > 0 ? (
          <p className="flex items-center gap-2 text-lg font-bold tabular-nums text-kin">
            <ZeniCoin size={20} />
            {t("zeni", { amount: rewardZeni })}
          </p>
        ) : (
          <p className="text-xs text-text-muted">{t("noZeni")}</p>
        )}
        <p className="text-xs text-text-muted">{t("cardsBack")}</p>
        {error && (
          <p role="alert" className="w-full rounded-control border border-shu/60 bg-surface p-3 text-sm text-shu">
            {error}
          </p>
        )}
        <div className="flex w-full flex-col gap-2">
          {requeueId && (
            <Button variant="primary" className="w-full" disabled={pending} onClick={requeue}>
              {t("requeue")}
            </Button>
          )}
          <Link href="/combat" className={buttonClasses(requeueId ? "secondary" : "primary", "w-full")}>
            {t("again")}
          </Link>
          {onReplay && (
            <Button className="w-full" onClick={onReplay}>
              {t("replay")}
            </Button>
          )}
          <Button className="w-full" onClick={onDismiss}>
            {t("viewBoard")}
          </Button>
        </div>
      </div>
    </dialog>
  );
}

/** Bilan refermé : un bouton au bas de la scène le rouvre. */
export function ShowResultButton({ onPress }: { onPress: () => void }) {
  const t = useTranslations("battle.result");
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 flex justify-center px-4">
      <Button variant="primary" className="pointer-events-auto" onClick={onPress}>
        {t("show")}
      </Button>
    </div>
  );
}
