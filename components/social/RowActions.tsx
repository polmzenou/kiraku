"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  cancelFriendRequestAction,
  respondFriendRequestAction,
  unblockUserAction,
  type SocialActionError,
} from "@/server/actions/social";
import { Button } from "../ui/Button";

type Mode = "incoming" | "outgoing" | "blocked";

/**
 * Actions d'une ligne de /amis. La ligne se replie tout de suite (mise à jour optimiste) et
 * réapparaît avec un message si le serveur refuse ; refresh() côté serveur recalcule la liste.
 */
export function RowActions({ username, mode }: { username: string; mode: Mode }) {
  const t = useTranslations("friends");
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(label: string, call: () => Promise<{ ok: true } | { ok: false; error: SocialActionError }>) {
    setDone(label);
    setError(null);
    startTransition(async () => {
      try {
        const res = await call();
        if (!res.ok) {
          setDone(null);
          setError(t(`errors.${res.error}`));
        }
      } catch {
        setDone(null);
        setError(t("errors.UNAVAILABLE"));
      }
    });
  }

  if (done) {
    return (
      <span role="status" className="text-sm text-text-muted">
        {done}
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        {mode === "incoming" && (
          <>
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={pending}
              onClick={() => run(t("accepted"), () => respondFriendRequestAction({ username, accept: true }))}
            >
              {t("accept")}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={() => run(t("declined"), () => respondFriendRequestAction({ username, accept: false }))}
            >
              {t("decline")}
            </Button>
          </>
        )}
        {mode === "outgoing" && (
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() => run(t("cancelled"), () => cancelFriendRequestAction({ username }))}
          >
            {t("cancelRequest")}
          </Button>
        )}
        {mode === "blocked" && (
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() => run(t("unblocked"), () => unblockUserAction({ username }))}
          >
            {t("unblock")}
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="max-w-48 text-right text-xs text-shu">
          {error}
        </p>
      )}
    </div>
  );
}
