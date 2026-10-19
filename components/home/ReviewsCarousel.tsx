"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { paginate, pinnedFirst, REVIEW_MAX_PAGES, REVIEW_PAGE_SIZE } from "@/lib/social/reviews";
import { PlayerAvatar } from "../social/PlayerAvatar";
import { Stars } from "./Stars";

export type ReviewCard = {
  id: string;
  rating: number;
  body: string;
  date: string;
  name: string;
  username: string;
  image: string | null;
  pinned: boolean;
  reply: string | null;
};

const INTERVAL_MS = 5000;
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
const prefersReducedMotion = () => window.matchMedia(REDUCED_MOTION).matches;

// Sur petit écran, une page n'affiche que ses premiers avis (2, puis 4 en 2 colonnes, 6 en 3) :
// l'échantillon est aléatoire, rien ne manque vraiment et la mise en page ne saute pas.
const VISIBILITY = ["flex", "flex", "hidden sm:flex", "hidden sm:flex", "hidden lg:flex", "hidden lg:flex"];

/**
 * Carrousel d'avis : une page de six avis tirés au hasard, qui change toutes les 5 s (en pause au
 * survol, au focus, onglet caché ou mouvement réduit). Les points permettent d'aller à une page ;
 * l'ordre reçu est déjà mélangé par le serveur, puis remélangé à chaque tour complet. Les avis
 * épinglés par la modération restent en tête de la première page.
 */
export function ReviewsCarousel({ reviews }: { reviews: ReviewCard[] }) {
  const t = useTranslations("home.reviews");
  const [order, setOrder] = useState(reviews);
  const [page, setPage] = useState(0);
  const [round, setRound] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion, () => false);
  const root = useRef<HTMLDivElement>(null);

  const pages = useMemo(() => paginate(order, REVIEW_PAGE_SIZE, REVIEW_MAX_PAGES), [order]);
  const count = pages.length;

  const next = useCallback(() => {
    if (page + 1 < count) return setPage(page + 1);
    setOrder((o) => pinnedFirst(o));
    setRound((r) => r + 1);
    setPage(0);
  }, [page, count]);

  useEffect(() => {
    if (paused || reduced || count < 2) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") next();
    }, INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [paused, reduced, count, next]);

  const current = pages[Math.min(page, count - 1)] ?? [];

  return (
    <div
      ref={root}
      role="region"
      aria-roledescription={t("carousel")}
      aria-label={t("carouselLabel")}
      className="flex flex-col gap-3"
      onPointerEnter={(e) => e.pointerType === "mouse" && setPaused(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => {
        if (!root.current?.contains(e.relatedTarget as Node | null)) setPaused(false);
      }}
    >
      <ul
        key={`${round}-${page}`}
        aria-live={paused ? "polite" : "off"}
        className="grid grid-cols-1 gap-3 transition-[opacity,translate] duration-500 ease-out starting:translate-y-1 starting:opacity-0 motion-reduce:transition-none sm:grid-cols-2 lg:grid-cols-3"
      >
        {current.map((r, i) => (
          <li key={r.id} className={`${VISIBILITY[i]} min-h-36 flex-col gap-3 lacquer rounded-card p-4`}>
            <div className="flex items-start gap-3">
              <PlayerAvatar username={r.username} image={r.image} size={40} />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate font-bold">{r.name}</span>
                <Stars rating={r.rating} label={t("ratingLabel", { rating: r.rating })} size={14} />
              </div>
              <span className="flex shrink-0 flex-col items-end gap-1 text-xs text-text-muted">
                {r.date}
                {r.pinned && <span className="font-bold text-kin">{t("pinned")}</span>}
              </span>
            </div>
            <p className="line-clamp-4 text-sm break-words whitespace-pre-line text-text-muted">{r.body}</p>
            {r.reply && (
              <div className="mt-auto flex flex-col gap-0.5 border-l-2 border-kin pl-3 text-sm">
                <span className="text-xs font-bold text-kin">{t("replyFrom")}</span>
                <p className="line-clamp-3 break-words whitespace-pre-line text-text-muted">{r.reply}</p>
              </div>
            )}
          </li>
        ))}
      </ul>

      {count > 1 && (
        <div className="flex items-center justify-center lg:justify-start">
          {pages.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={t("goTo", { page: i + 1, count })}
              aria-current={i === page ? "true" : undefined}
              onClick={() => setPage(i)}
              className="group flex size-11 items-center justify-center"
            >
              <span
                aria-hidden="true"
                className={`block h-2 rounded-full transition-[width,background-color] duration-300 motion-reduce:transition-none ${
                  i === page ? "w-5 bg-kin" : "w-2 bg-border group-hover:bg-text-muted"
                }`}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
