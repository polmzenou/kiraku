"use client";

import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { REVIEW_BODY_MAX, REVIEW_RATINGS } from "@/lib/social/reviews";
import { submitReview, type ReviewActionError } from "@/server/actions/reviews";
import { Button } from "../ui/Button";
import { Sheet } from "../ui/Sheet";
import { STAR_PATH } from "./Stars";

type Own = { rating: number; body: string } | null;

/** Bouton « Donner ton avis » et sa feuille : note en étoiles et message (un avis par joueur, modifiable). */
export function ReviewButton({ own: initial }: { own: Own }) {
  const t = useTranslations("home.reviews");
  const [own, setOwn] = useState<Own>(initial);
  const [open, setOpen] = useState(false);
  const [thanks, setThanks] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" variant="neutral" onClick={() => setOpen(true)}>
        {own ? t("edit") : t("give")}
      </Button>
      <p role="status" className="text-sm text-text-muted">
        {thanks ? t("thanks") : null}
      </p>
      <Sheet open={open} onClose={() => setOpen(false)} title={own ? t("edit") : t("give")}>
        {open && (
          <ReviewForm
            own={own}
            onDone={(saved) => {
              setOwn(saved);
              setThanks(true);
              setOpen(false);
            }}
          />
        )}
      </Sheet>
    </div>
  );
}

function ReviewForm({ own, onDone }: { own: Own; onDone: (saved: { rating: number; body: string }) => void }) {
  const t = useTranslations("home.reviews");
  const [rating, setRating] = useState(own?.rating ?? 0);
  const [hover, setHover] = useState(0);
  const [body, setBody] = useState(own?.body ?? "");
  const [error, setError] = useState<ReviewActionError | "NO_RATING" | null>(null);
  const [pending, start] = useTransition();
  const bodyId = useId();
  const countId = useId();
  const shown = hover || rating;

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (rating < 1) return setError("NO_RATING");
        setError(null);
        start(async () => {
          const res = await submitReview({ rating, body });
          if (res.ok) onDone({ rating: res.rating, body: res.body });
          else setError(res.error);
        });
      }}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-bold">{t("ratingField")}</legend>
        <div className="flex items-center gap-1" onPointerLeave={() => setHover(0)}>
          {REVIEW_RATINGS.map((value) => (
            <label key={value} className="relative cursor-pointer" onPointerEnter={() => setHover(value)}>
              <input
                type="radio"
                name="rating"
                value={value}
                checked={rating === value}
                onChange={() => setRating(value)}
                className="peer sr-only"
              />
              <span className="sr-only">{t("ratingOption", { rating: value })}</span>
              <span
                aria-hidden="true"
                className={`flex size-11 items-center justify-center rounded-button transition-transform peer-focus-visible:outline-2 peer-focus-visible:outline-kin active:scale-90 motion-reduce:transition-none ${
                  value <= shown ? "text-kin" : "text-border"
                }`}
              >
                <svg viewBox="0 0 24 24" width="32" height="32">
                  <path d={STAR_PATH} fill="currentColor" />
                </svg>
              </span>
            </label>
          ))}
          {rating > 0 && <span className="ml-2 text-sm text-text-muted tabular-nums">{t("ratingValue", { rating })}</span>}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <label htmlFor={bodyId} className="text-sm font-bold">
          {t("bodyField")}
        </label>
        <textarea
          id={bodyId}
          name="body"
          required
          rows={5}
          maxLength={REVIEW_BODY_MAX}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t("bodyPlaceholder")}
          aria-describedby={countId}
          className="min-h-32 w-full resize-y rounded-lg border border-border bg-surface p-3 text-base text-text placeholder:text-text-muted focus-visible:border-kin focus-visible:outline-none"
        />
        <p id={countId} className="self-end text-xs text-text-muted tabular-nums">
          {t("bodyCount", { count: body.length, max: REVIEW_BODY_MAX })}
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-shu">
          {t(`errors.${error}`)}
        </p>
      )}

      <Button type="submit" variant="shu" disabled={pending}>
        {pending ? t("sending") : t("submit")}
      </Button>
    </form>
  );
}
