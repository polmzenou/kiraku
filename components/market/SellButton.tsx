"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { sellerNet } from "@/lib/market/rules";
import { createAuctionAction, type MarketActionError } from "@/server/actions/market";
import { ButtonLink } from "../ui/ButtonLink";
import { Button } from "../ui/Button";
import { Sheet } from "../ui/Sheet";
import { inputClass } from "../ui/Field";
import { NoteField } from "../ui/NoteField";
import { segmentedFillClass, segmentedItemClass, segmentedTrackClass } from "../ui/Segmented";

/** Ce que la feuille doit savoir pour s'afficher ; le serveur revérifie tout à la mise en vente. */
export type SellInfo = {
  durationsHours: number[];
  feeBp: number;
  minStartPrice: number;
  maxPrice: number;
  /** Le plafond vient de la rareté de la carte. */
  rarityCapped: boolean;
  active: number;
  maxActive: number;
  minAccountAgeHours: number;
  block: "GUEST" | "TOO_NEW" | "BANNED" | "DISABLED" | null;
};

const field = `${inputClass} text-lg tabular-nums`;

/**
 * « Mettre en vente » depuis la fiche d'une carte : prix de départ, achat immédiat facultatif,
 * durée parmi celles de l'admin, et ce que le vendeur recevra après la taxe. Le serveur choisit
 * l'exemplaire (hors vitrine s'il y en a un autre) et le réserve pendant la vente.
 */
export function SellButton({ cardId, cardName, available, info }: { cardId: string; cardName: string; available: number; info: SellInfo }) {
  const t = useTranslations("market");
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState("100");
  const [withBuyout, setWithBuyout] = useState(false);
  const [buyout, setBuyout] = useState("");
  const [note, setNote] = useState("");
  const [duration, setDuration] = useState(info.durationsHours.includes(24) ? 24 : info.durationsHours[0]);
  const [error, setError] = useState<MarketActionError | "unexpected" | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const reason =
    info.block === "GUEST"
      ? t("sell.guest")
      : info.block === "TOO_NEW"
        ? t("sell.tooNew", { hours: info.minAccountAgeHours })
        : info.block === "DISABLED"
          ? t("sell.closed")
          : info.block === "BANNED"
            ? t("errors.UNAVAILABLE")
            : info.active >= info.maxActive
              ? t("sell.full", { max: info.maxActive })
              : available === 0
                ? t("sell.noCopy")
                : null;

  const startPrice = Number(start);
  const buyoutPrice = withBuyout ? Number(buyout) : null;
  const priceOk = (n: number) => Number.isSafeInteger(n) && n >= info.minStartPrice && n <= info.maxPrice;
  const valid = priceOk(startPrice) && (buyoutPrice === null || (priceOk(buyoutPrice) && buyoutPrice > startPrice));

  const submit = () =>
    startTransition(async () => {
      setError(null);
      try {
        const res = await createAuctionAction({ cardId, startPrice, buyoutPrice, durationHours: duration, note });
        if (res.ok) setCreated(res.auctionId);
        else setError(res.error);
      } catch {
        setError("unexpected");
      }
    });

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} disabled={reason !== null}>
        {t("sell.button")}
      </Button>
      {reason && <p className="text-xs text-text-muted">{reason}</p>}

      <Sheet open={open} onClose={() => setOpen(false)} title={t("sell.title", { card: cardName })}>
        {created ? (
          <div className="flex flex-col gap-3" role="status">
            <p className="font-bold">{t("sell.done")}</p>
            <ButtonLink href={`/marche/${created}`} variant="primary">
              {t("sell.viewSale")}
            </ButtonLink>
          </div>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (valid) submit();
            }}
          >
            <label className="flex flex-col gap-1 text-sm">
              {t("sell.startPrice")}
              <input
                type="number"
                inputMode="numeric"
                min={info.minStartPrice}
                max={info.maxPrice}
                step={1}
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className={field}
                required
              />
              <span className="text-xs text-text-muted">
                {t(info.rarityCapped ? "sell.rarityCap" : "sell.cap", { amount: info.maxPrice })}
              </span>
            </label>

            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" checked={withBuyout} onChange={(e) => setWithBuyout(e.target.checked)} className="choice" />
              {t("sell.buyoutOn")}
            </label>
            {withBuyout && (
              <label className="flex flex-col gap-1 text-sm">
                {t("sell.buyout")}
                <input
                  type="number"
                  inputMode="numeric"
                  min={Math.max(info.minStartPrice, startPrice + 1)}
                  max={info.maxPrice}
                  step={1}
                  value={buyout}
                  onChange={(e) => setBuyout(e.target.value)}
                  className={field}
                  required
                />
                <span className="text-xs text-text-muted">{t("sell.buyoutHint")}</span>
              </label>
            )}

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm">{t("sell.duration")}</legend>
              <div className={`${segmentedTrackClass} ${segmentedFillClass}`}>
                {info.durationsHours.map((h) => (
                  <label key={h} className={segmentedItemClass}>
                    <input type="radio" name="duration" value={h} checked={duration === h} onChange={() => setDuration(h)} className="sr-only" />
                    {t("sell.hours", { count: h })}
                  </label>
                ))}
              </div>
            </fieldset>

            <NoteField label={t("sell.note")} placeholder={t("sell.notePlaceholder")} value={note} onChange={setNote} />

            {priceOk(startPrice) && (
              <p className="text-sm text-text-muted">
                {t("sell.preview", { amount: sellerNet(startPrice, info.feeBp), fee: info.feeBp / 100 })}
              </p>
            )}
            <p className="text-xs text-text-muted">{t("sell.reserved")}</p>
            <p className="text-xs text-text-muted">{t("sell.limit", { count: info.active, max: info.maxActive })}</p>

            <Button type="submit" variant="primary" disabled={pending || !valid}>
              {pending ? t("sell.sending") : t("sell.confirm")}
            </Button>
            {error && (
              <p role="alert" className="text-sm text-shu">
                {t(`errors.${error}`)}
              </p>
            )}
          </form>
        )}
      </Sheet>
    </>
  );
}
