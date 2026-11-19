"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cancelBuyOrderAction, createBuyOrderAction, fillBuyOrderAction, type BuyOrderActionError } from "@/server/actions/buy-orders";
import { Button } from "../../ui/Button";
import { inputClass } from "../../ui/Field";
import { ZeniCoin } from "../../layout/ZeniCoin";

// Gestes des avis de recherche. Le serveur revérifie tout (prix vu, exemplaire, solde) : le client
// n'envoie que des ids, le prix proposé et le prix affiché.

type ErrorKey = BuyOrderActionError | "unexpected";

function useErrorText() {
  const t = useTranslations("market.orders.errors");
  return (code: ErrorKey | null) => (code ? t(code) : null);
}

/**
 * « Vendre pour X Zeni » en deux temps : le premier clic affiche le net après taxe et demande
 * confirmation, le second vend. Une offre changée entre-temps (STALE) rafraîchit la fiche.
 */
export function SellToOrder({ orderId, price, net, primary = true }: { orderId: string; price: number; net: number; primary?: boolean }) {
  const t = useTranslations("market.orders");
  const errorText = useErrorText();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<ErrorKey | null>(null);
  const [sold, setSold] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  if (sold !== null) return <p role="status" className="text-sm font-bold text-hisui">{t("sold", { amount: sold })}</p>;

  const sell = () =>
    startTransition(async () => {
      setError(null);
      try {
        const res = await fillBuyOrderAction({ orderId, expectedPrice: price });
        if (res.ok) setSold(res.net);
        else {
          setError(res.error);
          setConfirming(false);
          if (res.error === "STALE" || res.error === "CLOSED") router.refresh();
        }
      } catch {
        setError("unexpected");
      }
    });

  return (
    <div className="flex flex-col items-end gap-1">
      {confirming ? (
        <div className="flex flex-wrap justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>
            {t("cancel")}
          </Button>
          <Button size="sm" variant="primary" onClick={sell} disabled={pending} aria-describedby={`net-${orderId}`}>
            {pending ? t("selling") : t("confirmSell")}
          </Button>
        </div>
      ) : (
        <Button size="sm" variant={primary ? "primary" : "secondary"} onClick={() => setConfirming(true)}>
          {t("sellFor", { amount: price })}
        </Button>
      )}
      {confirming && <p id={`net-${orderId}`} className="text-xs text-text-muted">{t("net", { amount: net })}</p>}
      {error && <p role="alert" className="text-xs text-shu">{errorText(error)}</p>}
    </div>
  );
}

/** Retire un de ses avis : les Zeni bloqués reviennent tout de suite. */
export function CancelOrder({ orderId }: { orderId: string }) {
  const t = useTranslations("market.orders");
  const errorText = useErrorText();
  const [error, setError] = useState<ErrorKey | null>(null);
  const [pending, startTransition] = useTransition();
  const cancel = () =>
    startTransition(async () => {
      setError(null);
      try {
        const res = await cancelBuyOrderAction({ orderId });
        if (!res.ok) setError(res.error);
      } catch {
        setError("unexpected");
      }
    });
  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant="ghost" onClick={cancel} disabled={pending}>
        {pending ? t("withdrawing") : t("withdraw")}
      </Button>
      {error && <p role="alert" className="text-xs text-shu">{errorText(error)}</p>}
    </div>
  );
}

/**
 * Publier un avis : prix proposé (prérempli avec la cote), Zeni bloqués et solde, durée de validité.
 * Bornes affichées = celles du serveur (prix de départ minimal et plafond de la rareté).
 */
export function PostOrderForm({
  cardId,
  suggested,
  min,
  max,
  coins,
  days,
}: {
  cardId: string;
  suggested: number;
  min: number;
  max: number;
  coins: number;
  days: number;
}) {
  const t = useTranslations("market.orders");
  const errorText = useErrorText();
  const [price, setPrice] = useState(String(Math.min(max, Math.max(min, suggested))));
  const [error, setError] = useState<ErrorKey | null>(null);
  const [posted, setPosted] = useState(false);
  const [pending, startTransition] = useTransition();

  const value = Number(price);
  const inRange = Number.isSafeInteger(value) && value >= min && value <= max;
  const affordable = inRange && value <= coins;

  const submit = () =>
    startTransition(async () => {
      setError(null);
      try {
        const res = await createBuyOrderAction({ cardId, price: value });
        if (res.ok) setPosted(true);
        else setError(res.error);
      } catch {
        setError("unexpected");
      }
    });

  if (posted) return <p role="status" className="text-sm font-bold text-hisui">{t("posted", { amount: value, days })}</p>;

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (affordable) submit();
      }}
    >
      <label htmlFor={`order-price-${cardId}`} className="text-sm font-bold">{t("priceLabel")}</label>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"><ZeniCoin size={18} /></span>
          <input
            id={`order-price-${cardId}`}
            inputMode="numeric"
            className={`${inputClass} w-full pl-9 text-lg tabular-nums`}
            value={price}
            onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, "").slice(0, 9))}
            aria-invalid={!inRange || undefined}
            aria-describedby={`order-hint-${cardId}`}
          />
        </div>
        <Button type="submit" variant="primary" disabled={!affordable || pending}>
          {pending ? t("posting") : t("post")}
        </Button>
      </div>
      <p id={`order-hint-${cardId}`} className="text-xs text-text-muted">
        {!inRange ? t("range", { min, max }) : !affordable ? t("tooPoor", { coins }) : t("hold", { amount: value, coins, days })}
      </p>
      {error && <p role="alert" className="text-xs text-shu">{errorText(error)}</p>}
    </form>
  );
}
