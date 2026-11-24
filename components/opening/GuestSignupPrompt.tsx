"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import type { LotView } from "@/server/economy/lot-view";
import { LotGifts } from "../referral/LotGifts";
import { Button } from "../ui/Button";
import { ButtonLink } from "../ui/ButtonLink";
import { Sheet } from "../ui/Sheet";

/** Invité arrivé par le lien d'un parrain (parrainage v2) : son nom et le cadeau versé à l'inscription. */
export type GuestInvite = { referrer: string; lot: LotView | null; multiplier: number };

/**
 * Une invitation fermable par tirage, une fois toutes les cartes révélées. Arrivé par un lien d'invitation, l'invité
 * voit le cadeau de son parrain (proposition A « sous le récap » de l'atelier invitation).
 */
export function GuestSignupPrompt({ invite = null }: { invite?: GuestInvite | null }) {
  const t = useTranslations("opening.guestPrompt");
  const tInvite = useTranslations("invite.prompt");
  const [open, setOpen] = useState(true);

  return (
    <Sheet open={open} onClose={() => setOpen(false)} title={t("label")}>
      <div className="flex flex-col items-center gap-4 text-center">
        {invite ? (
          <span aria-hidden="true" lang="ja" className="flex size-16 items-center justify-center rounded-full bg-shu-btn font-seal text-3xl text-washi-paper">
            縁
          </span>
        ) : (
          <span aria-hidden="true" className="flex size-16 items-center justify-center rounded-full border border-kin/30 bg-kin/10 text-kin">
            <svg viewBox="0 0 48 48" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="17" y="8" width="23" height="32" rx="3" transform="rotate(12 28.5 24)" />
              <rect x="8" y="8" width="23" height="32" rx="3" className="fill-bg" />
              <path d="m19.5 17 2.5 5 5.5.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.5-.8 2.5-5Z" />
            </svg>
          </span>
        )}
        <p className="font-title text-2xl font-extrabold">{invite ? tInvite("title") : t("title")}</p>
        <p className="max-w-sm text-sm text-text-muted">{invite ? tInvite("body", { name: invite.referrer }) : t("body")}</p>
        {invite?.lot && <LotGifts lot={invite.lot} multiplier={invite.multiplier} className="justify-center" />}
        <div className="mt-2 flex w-full flex-col gap-3">
          <ButtonLink href="/inscription" variant="primary" onClick={() => setOpen(false)}>
            {invite ? tInvite("signUp") : t("signUp")}
          </ButtonLink>
          <Button type="button" onClick={() => setOpen(false)}>
            {t("later")}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
