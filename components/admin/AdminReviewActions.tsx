"use client";

import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { REVIEW_BODY_MAX } from "@/lib/social/reviews";
import {
  replyToReviewAction,
  setReviewHiddenAction,
  setReviewPinnedAction,
  type AdminReviewResult,
} from "@/server/actions/admin-reviews";
import { Button } from "../ui/Button";

/**
 * Actions de modération d'un avis : masquer / réafficher, épingler / désépingler (avis visible
 * seulement), répondre. Tout est réversible : pas de confirmation, la page se rafraîchit.
 */
export function AdminReviewActions({
  reviewId,
  hidden,
  pinned,
  reply,
}: {
  reviewId: string;
  hidden: boolean;
  pinned: boolean;
  reply: string | null;
}) {
  const t = useTranslations("admin.reviews");
  const fieldId = useId();
  const [error, setError] = useState<string | null>(null);
  const [replying, setReplying] = useState(false);
  const [draft, setDraft] = useState(reply ?? "");
  const [pending, startTransition] = useTransition();

  const send = (call: () => Promise<AdminReviewResult>, onOk?: () => void) =>
    startTransition(async () => {
      setError(null);
      try {
        const res = await call();
        if (res.ok) onOk?.();
        else setError(t(`errors.${res.error}`));
      } catch {
        setError(t("errors.unexpected"));
      }
    });

  const saveReply = (text: string) =>
    send(
      () => replyToReviewAction({ reviewId, reply: text }),
      () => setReplying(false),
    );

  return (
    <div className="flex flex-col gap-2 sm:items-end">
      <div className="flex flex-wrap gap-2 sm:justify-end">
        <Button
          type="button"
          variant={hidden ? "secondary" : "primary"}
          onClick={() => send(() => setReviewHiddenAction({ reviewId, hidden: !hidden }))}
          disabled={pending}
        >
          {hidden ? t("show") : t("hide")}
        </Button>
        {!hidden && (
          <Button
            type="button"
            onClick={() => send(() => setReviewPinnedAction({ reviewId, pinned: !pinned }))}
            disabled={pending}
            aria-pressed={pinned}
          >
            {pinned ? t("unpin") : t("pin")}
          </Button>
        )}
        <Button
          type="button"
          onClick={() => {
            setDraft(reply ?? "");
            setReplying((v) => !v);
          }}
          disabled={pending}
          aria-expanded={replying}
          aria-controls={fieldId}
        >
          {reply ? t("editReply") : t("reply")}
        </Button>
      </div>

      {replying && (
        <form
          id={fieldId}
          className="flex w-full flex-col gap-2 sm:max-w-md"
          onSubmit={(e) => {
            e.preventDefault();
            saveReply(draft);
          }}
        >
          <label htmlFor={`${fieldId}-text`} className="text-sm font-bold">
            {t("replyLabel")}
          </label>
          <textarea
            id={`${fieldId}-text`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={REVIEW_BODY_MAX}
            rows={4}
            className="min-h-24 w-full rounded-control border border-border bg-surface p-3 text-text placeholder:text-text-muted"
            placeholder={t("replyPlaceholder")}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" variant="primary" disabled={pending || draft.trim() === ""}>
              {t("saveReply")}
            </Button>
            {reply && (
              <Button type="button" onClick={() => saveReply("")} disabled={pending}>
                {t("deleteReply")}
              </Button>
            )}
            <span className="ml-auto text-xs text-text-muted tabular-nums">
              {t("chars", { count: draft.length, max: REVIEW_BODY_MAX })}
            </span>
          </div>
        </form>
      )}

      {error && (
        <p className="text-sm text-shu" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
