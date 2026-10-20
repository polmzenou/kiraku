"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import type { OpenedCardView } from "@/lib/boosters/view";
import { acceptOfferAction, declineOfferAction } from "@/server/actions/listings";
import { Button } from "../../ui/Button";

const CardReveal = dynamic(() => import("../../economy/CardReveal").then((m) => m.CardReveal), { ssr: false });

/**
 * Accepter (après confirmation, puis révélation de la carte reçue) ou refuser une offre reçue sur
 * une de ses annonces. Sert à « Mes échanges » et à la notification « nouvelle offre ».
 */
export function OfferDecision({ offerId, offeredName, onDone }: { offerId: string; offeredName: string; onDone?: () => void }) {
  const t = useTranslations("listings");
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState<OpenedCardView | null>(null);
  const [pending, startTransition] = useTransition();

  const fail = (code: string) => setError(t(`errors.${code}` as "errors.UNAVAILABLE"));

  const accept = () =>
    startTransition(async () => {
      setError(null);
      try {
        const res = await acceptOfferAction({ offerId });
        setConfirming(false);
        if (!res.ok) return fail(res.error);
        setReveal(res.card);
      } catch {
        fail("UNAVAILABLE");
      }
    });

  const decline = () =>
    startTransition(async () => {
      setError(null);
      try {
        const res = await declineOfferAction({ offerId });
        if (!res.ok) return fail(res.error);
        onDone?.();
      } catch {
        fail("UNAVAILABLE");
      }
    });

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <p role="alert" className="text-sm text-shu">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {confirming ? (
          <>
            <p className="mr-auto text-sm font-bold">{t("confirmAccept", { card: offeredName })}</p>
            <Button type="button" onClick={() => setConfirming(false)} disabled={pending}>
              {t("back")}
            </Button>
            <Button type="button" variant="primary" onClick={accept} disabled={pending}>
              {pending ? t("pending") : t("yesAccept")}
            </Button>
          </>
        ) : (
          <>
            <Button type="button" onClick={decline} disabled={pending}>
              {t("decline")}
            </Button>
            <Button type="button" variant="primary" onClick={() => setConfirming(true)} disabled={pending}>
              {t("accept")}
            </Button>
          </>
        )}
      </div>
      {reveal && (
        <CardReveal
          cards={[reveal]}
          onClose={() => {
            setReveal(null);
            onDone?.();
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
