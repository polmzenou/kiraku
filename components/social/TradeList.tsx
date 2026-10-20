"use client";

import dynamic from "next/dynamic";
import { useFormatter, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import type { OpenedCardView } from "@/lib/boosters/view";
import { acceptTradeAction, cancelTradeAction, declineTradeAction, markTradesSeenAction } from "@/server/actions/trades";
import type { TradeView } from "@/server/social/trades";
import { Fuda } from "../fuda/Fuda";
import { displayName } from "../profile/ProfileHeader";
import { Button } from "../ui/Button";
import { ChatWithButton } from "../chat/ChatDock";
import { PlayerAvatar } from "./PlayerAvatar";

const CardReveal = dynamic(() => import("../economy/CardReveal").then((m) => m.CardReveal), { ssr: false });

type Mode = "received" | "sent" | "history";

/** Une liste d'échanges (reçus, envoyés ou terminés), avec les actions possibles sur chacun. */
export function TradeList({ trades, mode }: { trades: TradeView[]; mode: Mode }) {
  const t = useTranslations("trades");
  if (trades.length === 0) return <p className="lacquer rounded-card p-4 text-sm text-text-muted">{t(`empty.${mode}`)}</p>;
  return (
    <ul className="flex flex-col gap-3">
      {trades.map((trade) => (
        <li key={trade.id}>
          <TradeCard trade={trade} mode={mode} />
        </li>
      ))}
    </ul>
  );
}

function TradeCard({ trade, mode }: { trade: TradeView; mode: Mode }) {
  const t = useTranslations("trades");
  const tAccount = useTranslations("account");
  const format = useFormatter();
  const router = useRouter();
  const [chosen, setChosen] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState<OpenedCardView | null>(null);
  const [pending, startTransition] = useTransition();
  const other = mode === "received" ? trade.proposer : mode === "sent" ? trade.recipient : null;
  const name = (p: TradeView["proposer"]) => displayName(p.username, p.isGuest, (code) => tAccount("guestName", { code }));

  const run = (call: () => Promise<{ ok: true } | { ok: false; error: string }>) =>
    startTransition(async () => {
      setError(null);
      try {
        const res = await call();
        if (!res.ok) setError(t(`errors.${res.error}` as "errors.UNAVAILABLE", { max: 0 }));
      } catch {
        setError(t("errors.UNAVAILABLE", { max: 0 }));
      }
    });

  const accept = () =>
    startTransition(async () => {
      if (!chosen) return;
      setError(null);
      try {
        const res = await acceptTradeAction({ tradeId: trade.id, chosenCardId: chosen });
        if (!res.ok) {
          setError(t(`errors.${res.error}` as "errors.UNAVAILABLE", { max: 0 }));
          setConfirming(false);
          return;
        }
        setReveal(res.card);
      } catch {
        setError(t("errors.UNAVAILABLE", { max: 0 }));
      }
    });

  return (
    <article className="flex flex-col gap-3 lacquer rounded-card p-3 md:p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-2 text-sm">
          {other ? (
            <>
              <PlayerAvatar username={other.username} image={other.image} size={28} />
              <span className="truncate">{t(mode === "received" ? "from" : "to", { name: name(other) })}</span>
            </>
          ) : (
            <span className="truncate">{t("between", { proposer: name(trade.proposer), recipient: name(trade.recipient) })}</span>
          )}
        </p>
        {mode === "history" ? (
          <span className="rounded-pill border border-border px-2 py-0.5 text-xs font-bold text-text-muted">{t(`status.${trade.status}`)}</span>
        ) : (
          <span className="rounded-pill border border-ai/50 px-2 py-0.5 text-xs font-bold text-ai tabular-nums">
            {t("expires", { when: format.relativeTime(trade.expiresAt) })}
          </span>
        )}
      </header>

      <div className="grid grid-cols-[5.5rem_auto_1fr] items-start gap-3 sm:grid-cols-[7rem_auto_1fr]">
        <div className="flex flex-col gap-1">
          <p className="text-xs text-text-muted">{t(mode === "received" ? "youGive" : mode === "sent" ? "youGet" : "wanted")}</p>
          <Fuda card={trade.wanted} series={trade.wanted.series} size="sm" tilt={false} />
        </div>
        <span aria-hidden="true" lang="ja" className="mt-8 font-seal text-xl text-shu">
          換
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-xs text-text-muted">
            {mode === "received" ? t("youGetOne") : mode === "sent" ? t("theyChooseOne") : trade.chosen ? t("chosen") : t("offered")}
          </p>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
            {(mode === "history" && trade.chosen ? [trade.chosen] : trade.offers).map((card) => {
              const selectable = mode === "received" && !confirming;
              const picked = chosen === card.cardId;
              return (
                <li key={card.cardId}>
                  {selectable ? (
                    <button
                      type="button"
                      aria-pressed={picked}
                      onClick={() => setChosen(picked ? null : card.cardId)}
                      className="relative block w-full rounded-fuda outline-offset-2 transition-transform active:scale-[0.97] aria-pressed:outline-3 aria-pressed:outline-shu motion-reduce:transition-none"
                    >
                      <Fuda card={card} series={card.series} size="sm" tilt={false} />
                      <span className="sr-only">{t("choose", { card: card.name })}</span>
                    </button>
                  ) : (
                    <div className={mode === "received" && chosen !== card.cardId ? "opacity-40" : ""}>
                      <Fuda card={card} series={card.series} size="sm" tilt={false} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-shu">
          {error}
        </p>
      )}

      {mode !== "history" && (
        <footer className="flex flex-wrap items-center justify-end gap-2">
          {confirming ? (
            <>
              <p className="mr-auto text-sm font-bold">{t("confirm")}</p>
              <Button type="button" onClick={() => setConfirming(false)} disabled={pending}>
                {t("cancelConfirm")}
              </Button>
              <Button type="button" variant="primary" onClick={accept} disabled={pending}>
                {pending ? t("pending") : t("yesAccept")}
              </Button>
            </>
          ) : (
            <>
              {other && <ChatWithButton username={other.username} className="mr-auto" />}
              {mode === "received" ? (
                <>
                  <Button type="button" onClick={() => run(() => declineTradeAction({ tradeId: trade.id }))} disabled={pending}>
                    {t("decline")}
                  </Button>
                  <Button type="button" variant="primary" disabled={!chosen || pending} onClick={() => setConfirming(true)}>
                    {chosen ? t("accept") : t("pickFirst")}
                  </Button>
                </>
              ) : (
                <Button type="button" onClick={() => run(() => cancelTradeAction({ tradeId: trade.id }))} disabled={pending}>
                  {t("withdraw")}
                </Button>
              )}
            </>
          )}
        </footer>
      )}

      {reveal && (
        <CardReveal
          cards={[reveal]}
          onClose={() => {
            setReveal(null);
            router.refresh();
          }}
        />
      )}
    </article>
  );
}

/**
 * Cartes reçues par échange depuis la dernière visite du proposant : révélées comme au sortir d'un
 * booster, puis marquées vues.
 */
export function TradeReveals({ tradeIds, cards }: { tradeIds: string[]; cards: OpenedCardView[] }) {
  const [open, setOpen] = useState(cards.length > 0);
  if (!open || cards.length === 0) return null;
  return (
    <CardReveal
      cards={cards}
      onClose={() => {
        setOpen(false);
        void markTradesSeenAction({ tradeIds });
      }}
    />
  );
}
