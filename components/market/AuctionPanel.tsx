"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { sellerNet } from "@/lib/market/rules";
import {
  auctionLiveAction,
  buyNowAction,
  cancelAuctionAction,
  placeBidAction,
  type MarketActionError,
} from "@/server/actions/market";
import type { AuctionLive } from "@/server/market/queries";
import { ButtonLink } from "../ui/ButtonLink";
import { ZeniCoin } from "../layout/ZeniCoin";
import { Button } from "../ui/Button";
import { Countdown } from "./Countdown";

type Confirming = { kind: "bid"; amount: number } | { kind: "buy"; amount: number } | { kind: "withdraw" } | null;

/** Pourquoi le joueur ne peut pas miser (décidé par le serveur, revérifié à chaque mise). */
export type TradeBlock = "GUEST" | "TOO_NEW" | "BANNED" | "DISABLED" | null;

/**
 * Panneau d'une vente : prix et fin en direct (sondés toutes les `pollSeconds` tant que l'onglet
 * est visible), mise en deux temps avec affichage optimiste, achat immédiat, retrait pour le
 * vendeur. Le serveur décide de tout ; un refus remet l'affichage à jour.
 */
export function AuctionPanel({
  auctionId,
  initial,
  feeBp,
  mine,
  coins: initialCoins,
  block,
  pollSeconds,
  serverNow,
  rules,
}: {
  auctionId: string;
  initial: AuctionLive;
  feeBp: number;
  mine: boolean;
  coins: number;
  block: TradeBlock;
  pollSeconds: number;
  serverNow: number;
  rules: { increment: number; window: number; extend: number; fee: number };
}) {
  const t = useTranslations("market");
  const router = useRouter();
  const [live, setLive] = useState(initial);
  const [shown, setShown] = useOptimistic(live, (state: AuctionLive, amount: number) => ({
    ...state,
    price: amount,
    currentBid: amount,
    leading: true,
    bidCount: state.bidCount + 1,
  }));
  const [coins, setCoins] = useState(initialCoins);
  // Tant que le joueur n'a rien tapé, le champ suit la mise minimale (qui monte avec les mises des autres)
  const [typed, setTyped] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const status = useRef(initial.status);

  // Nouveau rendu serveur (refresh après une action, fin de vente) : il fait foi
  const [rendered, setRendered] = useState(initial);
  if (rendered !== initial) {
    setRendered(initial);
    setLive(initial);
    setCoins(initialCoins);
  }

  // La vente vient de se terminer (sondage ou réponse) : la page serveur affiche le résultat
  useEffect(() => {
    if (status.current === "ACTIVE" && live.status !== "ACTIVE") router.refresh();
    status.current = live.status;
  }, [live.status, router]);

  useEffect(() => {
    if (live.status !== "ACTIVE") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const poll = async () => {
      try {
        const res = await auctionLiveAction({ auctionId });
        if (!res.ok || stopped) return;
        setLive(res.live);
        // Dépassé entre-temps : « Mise enregistrée » ne décrit plus la situation
        if (!res.live.leading) setMessage((m) => (m?.tone === "ok" ? null : m));
      } catch {
        // Réseau coupé : prochain tour
      }
    };
    const schedule = () => {
      clearTimeout(timer);
      if (stopped || document.visibilityState !== "visible") return;
      timer = setTimeout(async () => {
        await poll();
        schedule();
      }, pollSeconds * 1000);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void poll().then(schedule);
      else clearTimeout(timer);
    };
    schedule();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [auctionId, pollSeconds, live.status]);

  const fail = (error: MarketActionError | "unexpected") => setMessage({ tone: "error", text: t(`errors.${error}`) });

  const run = (c: NonNullable<Confirming>) =>
    startTransition(async () => {
      setMessage(null);
      setConfirming(null);
      try {
        if (c.kind === "withdraw") {
          const res = await cancelAuctionAction({ auctionId });
          if (!res.ok) return fail(res.error);
          setMessage({ tone: "ok", text: t("detail.withdrawn") });
          router.refresh();
          return;
        }
        setShown(c.amount);
        const res =
          c.kind === "bid"
            ? await placeBidAction({ auctionId, amount: c.amount })
            : await buyNowAction({ auctionId, expectedPrice: c.amount });
        if (!res.ok) {
          fail(res.error);
          // Quelqu'un est passé avant : on montre tout de suite le nouvel état
          const fresh = await auctionLiveAction({ auctionId });
          if (fresh.ok) setLive(fresh.live);
          return;
        }
        setCoins(res.coins);
        setTyped(null);
        if (res.live) setLive(res.live);
        setMessage({ tone: "ok", text: res.sold ? t("detail.boughtOk") : t("detail.bidOk") });
      } catch {
        fail("unexpected");
      }
    });

  const open = shown.status === "ACTIVE";
  const amount = typed ?? String(shown.minNext);
  const bid = Number(amount);
  const validBid = Number.isSafeInteger(bid) && bid >= shown.minNext;
  const endsAt = new Date(shown.endsAt).getTime();

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4" aria-live="polite">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-sm text-text-muted">
            {!open && shown.status === "SOLD" ? t("detail.finalPrice") : shown.currentBid !== null ? t("detail.currentBid") : t("detail.startPrice")}
          </span>
          <span className="flex items-center gap-2">
            <ZeniCoin size={22} />
            <span className="text-3xl font-extrabold tabular-nums text-kin">{t("zeni", { amount: shown.finalPrice ?? shown.price })}</span>
          </span>
          <span className="text-sm text-text-muted">{t("bids", { count: shown.bidCount })}</span>
        </div>
        {open && <Countdown endsAt={endsAt} serverNow={serverNow} refreshOnEnd className="text-sm" />}
      </div>

      {open && shown.bidCount > 0 && !shown.leading && (
        <p className="text-sm">{t("detail.leader", { name: shown.leaderName ?? t("detail.anonymous") })}</p>
      )}
      {open && shown.leading && <p className="rounded-button border border-kin/60 p-3 text-sm">{t("detail.youLead")}</p>}

      {!open && (
        <p className="rounded-button border border-border bg-surface-2 p-3 text-sm">
          {shown.status === "SOLD"
            ? shown.leading
              ? t("detail.soldYou", { amount: shown.finalPrice ?? shown.price })
              : t("detail.soldFor", { amount: shown.finalPrice ?? shown.price, name: shown.leaderName ?? t("detail.anonymous") })
            : shown.status === "EXPIRED"
              ? t("detail.expired")
              : t("detail.cancelled")}
        </p>
      )}
      {!open && shown.status === "SOLD" && shown.leading && (
        <ButtonLink href="/collection" className="w-fit">
          {t("detail.toCollection")}
        </ButtonLink>
      )}

      {open && mine && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-text-muted">
            {t("detail.ownSale", { amount: sellerNet(shown.price, feeBp), fee: feeBp / 100 })}
          </p>
          {shown.bidCount === 0 &&
            (confirming?.kind === "withdraw" ? (
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" onClick={() => setConfirming(null)} disabled={pending}>
                  {t("detail.cancel")}
                </Button>
                <Button type="button" variant="shu" onClick={() => run({ kind: "withdraw" })} disabled={pending}>
                  {pending ? t("detail.withdrawing") : t("detail.confirmWithdraw")}
                </Button>
              </div>
            ) : (
              <>
                <p className="text-xs text-text-muted">{t("detail.withdrawHint")}</p>
                <Button type="button" onClick={() => setConfirming({ kind: "withdraw" })} className="w-fit">
                  {t("detail.withdraw")}
                </Button>
              </>
            ))}
        </div>
      )}

      {open && !mine && block && <p className="text-sm text-shu">{t(`errors.${block === "BANNED" ? "UNAVAILABLE" : block}`)}</p>}

      {open && !mine && !block && !shown.leading && (
        <div className="flex flex-col gap-3">
          {confirming?.kind === "bid" || confirming?.kind === "buy" ? (
            <div className="flex flex-col gap-2 rounded-button border border-shu p-3">
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" onClick={() => setConfirming(null)} disabled={pending}>
                  {t("detail.change")}
                </Button>
                <Button type="button" variant="shu" onClick={() => run(confirming)} disabled={pending}>
                  <ZeniCoin size={14} />
                  {confirming.kind === "bid"
                    ? t("detail.confirmBid", { amount: confirming.amount })
                    : t("detail.confirmBuy", { amount: confirming.amount })}
                </Button>
              </div>
            </div>
          ) : (
            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!validBid) return;
                if (bid > coins) return setMessage({ tone: "error", text: t("detail.notEnough", { amount: coins }) });
                setMessage(null);
                setConfirming({ kind: "bid", amount: bid });
              }}
            >
              <label className="flex flex-col gap-1 text-sm">
                {t("detail.bidLabel")}
                <input
                  type="number"
                  inputMode="numeric"
                  min={shown.minNext}
                  step={1}
                  value={amount}
                  onChange={(e) => setTyped(e.target.value)}
                  className="min-h-11 rounded-button border border-border bg-surface-2 px-3 text-lg tabular-nums"
                />
              </label>
              <p className="text-xs text-text-muted">{t("detail.minNext", { amount: shown.minNext })}</p>
              <Button type="submit" variant="shu" disabled={pending || !validBid}>
                {pending ? t("detail.bidding") : t("detail.bid")}
              </Button>
            </form>
          )}
          {shown.buyoutPrice !== null && !confirming && (
            <Button
              type="button"
              disabled={pending}
              onClick={() => {
                if (shown.buyoutPrice! > coins) return setMessage({ tone: "error", text: t("detail.notEnough", { amount: coins }) });
                setMessage(null);
                setConfirming({ kind: "buy", amount: shown.buyoutPrice! });
              }}
            >
              <ZeniCoin size={14} />
              {pending ? t("detail.buying") : t("detail.buyNow", { amount: shown.buyoutPrice })}
            </Button>
          )}
        </div>
      )}

      {message && (
        <p role={message.tone === "error" ? "alert" : "status"} className={`text-sm ${message.tone === "ok" ? "text-text" : "text-shu"}`}>
          {message.text}
        </p>
      )}

      {open && <p className="text-xs text-text-muted">{t("detail.rules", rules)}</p>}
    </section>
  );
}
