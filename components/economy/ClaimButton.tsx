"use client";

import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { useState, useTransition } from "react";
import type { OpenedCardView } from "@/lib/boosters/view";
import { claimMissionAction, claimReferralAction, type EconomyActionError, type RewardSummary } from "@/server/actions/economy";
import { Button } from "../ui/Button";
import { RewardText } from "./RewardText";

// La scène de révélation (Motion) n'est chargée que lorsqu'une carte est gagnée
const CardReveal = dynamic(() => import("./CardReveal").then((m) => m.CardReveal), { ssr: false });

type ClaimOutcome = { ok: true; reward: RewardSummary } | { ok: false; error: EconomyActionError };

/**
 * Bouton « Réclamer » : le serveur recalcule tout, le bouton n'affiche que la réponse. Il reste
 * monté une fois la récompense reçue (`claimed`) : le rafraîchissement de la page ne coupe ni le
 * message ni la révélation des cartes gagnées.
 */
function ClaimButton({ claim, claimed, claimedLabel }: { claim: () => Promise<ClaimOutcome>; claimed: boolean; claimedLabel: string }) {
  const t = useTranslations("economy");
  const [pending, startTransition] = useTransition();
  const [reward, setReward] = useState<RewardSummary | null>(null);
  const [reveal, setReveal] = useState<OpenedCardView[] | null>(null);
  const [error, setError] = useState<EconomyActionError | "unexpected" | null>(null);

  const run = () =>
    startTransition(async () => {
      setError(null);
      try {
        const res = await claim();
        if (res.ok) {
          setReward(res.reward);
          if (res.reward.cards.length > 0) setReveal(res.reward.cards);
        } else {
          setError(res.error);
        }
      } catch {
        setError("unexpected");
      }
    });

  return (
    <>
      {reward ? (
        <p className="flex items-center gap-1.5 text-sm font-bold text-kin" role="status">
          <span aria-hidden="true" lang="ja" className="font-seal">
            済
          </span>
          <RewardText reward={reward} />
        </p>
      ) : claimed ? (
        <p className="flex items-center gap-1.5 text-sm font-bold text-text-muted">
          <span aria-hidden="true" lang="ja" className="font-seal text-shu">
            済
          </span>
          {claimedLabel}
        </p>
      ) : (
        <div className="flex flex-col items-stretch gap-1 sm:items-end">
          <Button type="button" variant="shu" onClick={run} disabled={pending} className="min-w-32">
            {pending ? t("claiming") : t("claim")}
          </Button>
          {error && (
            <p className="text-sm text-shu" role="alert">
              {t(`errors.${error}`)}
            </p>
          )}
        </div>
      )}
      {reveal && <CardReveal cards={reveal} onClose={() => setReveal(null)} />}
    </>
  );
}

export function ClaimMissionButton({ missionId, claimed }: { missionId: string; claimed: boolean }) {
  const t = useTranslations("economy.missions");
  return <ClaimButton claim={() => claimMissionAction({ missionId })} claimed={claimed} claimedLabel={t("claimed")} />;
}

export function ClaimReferralButton({ referralId, claimed }: { referralId: string; claimed: boolean }) {
  const t = useTranslations("economy.referral");
  return <ClaimButton claim={() => claimReferralAction({ referralId })} claimed={claimed} claimedLabel={t("claimed")} />;
}
