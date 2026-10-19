"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import type { Relation } from "@/lib/social/relation";
import {
  blockUserAction,
  cancelFriendRequestAction,
  removeFriendAction,
  respondFriendRequestAction,
  sendFriendRequestAction,
  unblockUserAction,
  type SocialActionError,
} from "@/server/actions/social";
import { Link } from "@/i18n/navigation";
import { Button, buttonClasses } from "../ui/Button";
import { Sheet } from "../ui/Sheet";
import { GiftSheet, type GiftInfo } from "./GiftSheet";
import { TradeComposer } from "./TradeComposer";

type Pending = "send" | "accept" | "decline" | "cancel" | "remove" | "block" | "unblock";

/**
 * Boutons du profil d'un autre joueur selon la relation : ajouter, accepter / refuser, annuler,
 * offrir, retirer, bloquer. La relation affichée change tout de suite (mise à jour optimiste)
 * et revient à l'état précédent si le serveur refuse.
 */
export function RelationActions({
  username,
  name,
  initial,
  gift,
  trade = null,
}: {
  username: string;
  name: string;
  initial: Relation;
  gift: GiftInfo | null;
  /** Échanges ouverts entre amis : nombre maximal de cartes offertes. */
  trade?: { maxOffered: number } | null;
}) {
  const t = useTranslations("friends");
  const tBattle = useTranslations("battle");
  const [relation, setRelation] = useState<Relation>(initial);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [running, setRunning] = useState<Pending | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [confirm, setConfirm] = useState<"remove" | "block" | null>(null);
  const [giftOpen, setGiftOpen] = useState(false);
  const [tradeOpen, setTradeOpen] = useState(false);

  function run(kind: Pending, optimistic: Relation, call: () => Promise<{ ok: true } | { ok: false; error: SocialActionError }>, done?: string) {
    const before = relation;
    setRelation(optimistic);
    setMessage(null);
    setRunning(kind);
    startTransition(async () => {
      try {
        const res = await call();
        if (!res.ok) {
          setRelation(before);
          setMessage(t(`errors.${res.error}`));
        } else if (done) {
          setMessage(done);
        }
      } catch {
        setRelation(before);
        setMessage(t("errors.UNAVAILABLE"));
      } finally {
        setRunning(null);
      }
    });
  }

  const send = () => {
    const before = relation;
    setRelation("OUTGOING");
    setMessage(null);
    setRunning("send");
    startTransition(async () => {
      try {
        const res = await sendFriendRequestAction({ username });
        if (!res.ok) {
          setRelation(before);
          setMessage(t(`errors.${res.error}`));
          return;
        }
        // « ALREADY » : l'écran n'était plus à jour, refresh() côté serveur l'a recalculé
        if (res.status === "ACCEPTED") setRelation("FRIENDS");
        setMessage(res.status === "ACCEPTED" ? t("nowFriends", { name }) : t("requestSent"));
      } catch {
        setRelation(before);
        setMessage(t("errors.UNAVAILABLE"));
      } finally {
        setRunning(null);
      }
    });
  };

  const busy = (kind: Pending) => pending && running === kind;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {relation === "NONE" && (
          <Button type="button" variant="primary" onClick={send} disabled={pending}>
            {busy("send") ? t("pending") : t("add")}
          </Button>
        )}
        {relation === "OUTGOING" && (
          <>
            <span className="inline-flex min-h-11 items-center rounded-control border border-border px-4 text-sm text-text-muted">
              {t("requestPending")}
            </span>
            <Button
              type="button"
              disabled={pending}
              onClick={() => run("cancel", "NONE", () => cancelFriendRequestAction({ username }))}
            >
              {t("cancelRequest")}
            </Button>
          </>
        )}
        {relation === "INCOMING" && (
          <>
            <Button
              type="button"
              variant="primary"
              disabled={pending}
              onClick={() =>
                run("accept", "FRIENDS", () => respondFriendRequestAction({ username, accept: true }), t("nowFriends", { name }))
              }
            >
              {t("accept")}
            </Button>
            <Button
              type="button"
              disabled={pending}
              onClick={() => run("decline", "NONE", () => respondFriendRequestAction({ username, accept: false }))}
            >
              {t("decline")}
            </Button>
          </>
        )}
        {relation === "FRIENDS" && (
          <>
            <span className="inline-flex min-h-11 items-center gap-1.5 rounded-control border border-border px-4 text-sm">
              <span aria-hidden="true" lang="ja" className="font-seal text-shu">
                友
              </span>
              {t("isFriend")}
            </span>
            {gift && (
              <Button type="button" variant="primary" onClick={() => setGiftOpen(true)}>
                {t("gift")}
              </Button>
            )}
            {trade && (
              <Button type="button" onClick={() => setTradeOpen(true)}>
                <span aria-hidden="true" lang="ja" className="font-seal text-shu">
                  換
                </span>
                {t("trade")}
              </Button>
            )}
            <Link href={`/combat?defier=${encodeURIComponent(username)}`} className={buttonClasses("secondary")}>
              <span aria-hidden="true" lang="ja" className="font-seal text-shu">
                戦
              </span>
              {tBattle("friend.challenge")}
            </Link>
          </>
        )}
        {relation === "BLOCKED_BY_ME" && (
          <Button type="button" disabled={pending} onClick={() => run("unblock", "NONE", () => unblockUserAction({ username }))}>
            {t("unblock")}
          </Button>
        )}
        {relation !== "BLOCKED_BY_ME" && (
          <Button type="button" aria-label={t("more", { name })} onClick={() => setMoreOpen(true)} className="px-3">
            <span aria-hidden="true">⋯</span>
          </Button>
        )}
      </div>

      <p role="status" aria-live="polite" className="min-h-5 text-sm text-text-muted">
        {message}
      </p>

      <Sheet
        open={moreOpen}
        onClose={() => {
          setMoreOpen(false);
          setConfirm(null);
        }}
        title={name}
      >
        {confirm ? (
          <div className="flex flex-col gap-3">
            <p>{t(confirm === "block" ? "blockConfirm" : "removeConfirm", { name })}</p>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" onClick={() => setConfirm(null)}>
                {t("back")}
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={() => {
                  setMoreOpen(false);
                  setConfirm(null);
                  if (confirm === "block") run("block", "BLOCKED_BY_ME", () => blockUserAction({ username }), t("blocked", { name }));
                  else run("remove", "NONE", () => removeFriendAction({ username }));
                }}
              >
                {t(confirm === "block" ? "block" : "remove")}
              </Button>
            </div>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {relation === "FRIENDS" && (
              <li>
                <Button type="button" className="w-full" onClick={() => setConfirm("remove")}>
                  {t("remove")}
                </Button>
              </li>
            )}
            <li>
              <Button type="button" className="w-full" onClick={() => setConfirm("block")}>
                {t("block")}
              </Button>
              <p className="mt-1 text-xs text-text-muted">{t("blockHint")}</p>
            </li>
          </ul>
        )}
      </Sheet>

      {trade && relation === "FRIENDS" && tradeOpen && (
        <TradeComposer username={username} name={name} maxOffered={trade.maxOffered} onClose={() => setTradeOpen(false)} />
      )}
      {gift && relation === "FRIENDS" && giftOpen && (
        <GiftSheet username={username} name={name} info={gift} onClose={() => setGiftOpen(false)} />
      )}
    </div>
  );
}
