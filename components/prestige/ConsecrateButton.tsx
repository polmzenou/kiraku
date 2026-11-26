"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import type { FudaCard } from "@/components/fuda/Fuda";
import { consecrateAction } from "@/server/actions/prestige";
import { Fuda } from "../fuda/Fuda";
import { useReducedFx } from "../motion/MotionPreference";
import { Button } from "../ui/Button";
import { HoldButton } from "../ui/HoldButton";
import { Sheet } from "../ui/Sheet";
import { useConsecrationRite } from "./ConsecrationRiteHost";

/**
 * « Consacrer » une héritière au plafond, depuis sa ligne d'exemplaire : la feuille explique ce qui se passe (la carte
 * quitte le jeu pour toujours), le bouton se maintient, puis le rite se joue et mène au sanctuaire du profil.
 *
 * Le rite n'est pas rendu ici : l'action rafraîchit la fiche, et cette ligne disparaît avec l'exemplaire consacré. Il
 * est confié à l'hôte du layout de /collection (ConsecrationRiteHost), qui reste monté.
 */
export function ConsecrateButton({ userCardId, card, username }: { userCardId: string; card: FudaCard & { series?: string }; username: string }) {
  const t = useTranslations("prestige.consecrate");
  const reduced = useReducedFx();
  const startRite = useConsecrationRite();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const consecrate = useCallback(() => {
    setError(null);
    start(async () => {
      // Coupure réseau ou erreur relancée par l'action : un message dans la feuille, pas l'écran d'erreur de la page,
      // et la fiche relue (la consécration a pu passer avant la coupure)
      const res = await consecrateAction({ userCardId }).catch(() => null);
      if (!res) {
        setError(t("errors.UNAVAILABLE"));
        router.refresh();
        return;
      }
      if (!res.ok) {
        setError(t(`errors.${res.error}`));
        return;
      }
      // Cette ligne est peut-être déjà démontée par la fiche rafraîchie : seul l'hôte, stable, compte ici
      setOpen(false);
      startRite?.({ card, username });
    });
  }, [card, router, startRite, t, userCardId, username]);

  return (
    <>
      <Button
        type="button"
        size="sm"
        className="self-start border-kin/60 text-kin"
        onClick={() => {
          setOpen(true);
          // Le rite est préchargé pendant que la feuille explique et que le bouton se maintient
          void import("./ConsecrationRite");
        }}
      >
        <span aria-hidden="true" lang="ja" className="font-seal">奉</span> {t("open")}
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t("title")}>
        <div className="flex flex-col gap-4">
          <div className="mx-auto w-36">
            <Fuda card={card} size="sm" still describeImage />
          </div>
          <p className="text-sm">{t("intro")}</p>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-text-muted">
            <li>{t("forever")}</li>
            <li>{t("sanctuary")}</li>
            <li>{t("noZeni")}</li>
          </ul>
          {error && (
            <p role="alert" className="text-sm text-shu">
              {error}
            </p>
          )}
          <HoldButton
            label={t("hold")}
            kanji="奉納"
            pendingLabel={t("pending")}
            confirmLabel={t("holdConfirm")}
            hint={t("holdHint")}
            disabled={false}
            pending={pending}
            reduced={reduced}
            onHold={consecrate}
          />
        </div>
      </Sheet>
    </>
  );
}
