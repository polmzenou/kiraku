"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { useReducedFx } from "@/components/motion/MotionPreference";
import type { NewsView } from "@/lib/home/news";
import { rememberNewsCollapsed } from "@/lib/home/news-dom";
import { NewsBanner } from "./NewsBanner";

/** Avance automatique du carrousel (arrêtée au survol, au focus, au toucher et en mouvement réduit). */
const ADVANCE_MS = 7_000;

const ROUND = "inline-flex size-11 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-2 hover:text-text";

function Chevron({ dir, className = "size-4" }: { dir: "left" | "right" | "down"; className?: string }) {
  const d = dir === "left" ? "m15 6-6 6 6 6" : dir === "right" ? "m9 6 6 6-6 6" : "m6 9 6 6 6-6";
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d={d} />
    </svg>
  );
}

/**
 * Encart « Nouveautés » de l'accueil : un carrousel de grandes bannières (cartes, booster, image ou
 * sceau), réglé dans /admin/nouveautes. On le fait glisser, on passe d'une bannière à l'autre par les
 * points ou les flèches, et il avance seul quand on ne le touche pas. Réduit, il tient sur une ligne ;
 * le choix est gardé pour cette publication (cookie lu par le serveur), une nouvelle publication le
 * rouvre. `preview` : aperçu de l'admin, qui ne touche pas à la préférence du joueur.
 */
export function NewsPanelView({ news, initialCollapsed, preview = false }: { news: NewsView; initialCollapsed: boolean; preview?: boolean }) {
  const t = useTranslations("news");
  const format = useFormatter();
  const id = useId();
  const reduced = useReducedFx();
  const section = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [active, setActive] = useState(0);
  // Lecture voulue par le joueur (bouton pause), et pauses passagères (survol, focus, encart hors écran)
  const [playing, setPlaying] = useState(true);
  const [held, setHeld] = useState(false);
  const [inView, setInView] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const count = news.items.length;
  const date = news.publishedAt ? format.dateTime(new Date(news.publishedAt), { day: "numeric", month: "long", timeZone: "Europe/Paris" }) : null;

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    if (!preview) rememberNewsCollapsed(next ? news.revision : null);
  };

  const goTo = (index: number) => {
    const el = track.current;
    if (!el) return;
    el.scrollTo({ left: index * el.clientWidth, behavior: reduced ? "auto" : "smooth" });
  };

  // Bannière active d'après la position de la piste (glisser, points, avance automatique)
  const onScroll = () => {
    const el = track.current;
    if (!el || el.clientWidth === 0) return;
    setActive(Math.min(count - 1, Math.max(0, Math.round(el.scrollLeft / el.clientWidth))));
  };

  // N'avance que si l'encart est à l'écran et l'onglet au premier plan
  useEffect(() => {
    const el = section.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.35 });
    observer.observe(el);
    const onVisibility = () => setPageVisible(document.visibilityState === "visible");
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    if (!playing || held || !inView || !pageVisible || reduced || collapsed || count < 2) return;
    const timer = setTimeout(() => {
      const el = track.current;
      if (el) el.scrollTo({ left: ((active + 1) % count) * el.clientWidth, behavior: "smooth" });
    }, ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [active, collapsed, count, held, inView, pageVisible, playing, reduced]);

  const autoplay = count > 1 && !reduced;

  return (
    <section ref={section} aria-labelledby={`${id}-title`} className="relative isolate overflow-hidden rounded-2xl border border-kin/30 bg-surface/50">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,var(--k-kin),transparent_60%)] opacity-10"
      />
      <div className={`flex items-center gap-3 pr-2 pl-4 ${collapsed ? "py-0.5" : "pt-2"}`}>
        <h2 id={`${id}-title`} className={`min-w-0 flex-1 font-body ${collapsed ? "truncate text-sm" : "pt-1"}`}>
          <span className="text-xs font-bold tracking-wide text-shu">
            <span aria-hidden="true">✦ </span>
            {t("label")}
          </span>
          {collapsed ? (
            <span className="font-bold"> · {news.title}</span>
          ) : (
            <span className="mt-0.5 block font-heading text-xl leading-tight sm:text-2xl">{news.title}</span>
          )}
        </h2>
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-controls={`${id}-body`}
          aria-label={collapsed ? t("showLabel") : t("hideLabel")}
          onClick={toggle}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 self-start rounded-full px-3 text-xs font-bold text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
        >
          {collapsed ? t("show") : t("hide")}
          <Chevron dir="down" className={`size-4 transition-transform motion-reduce:transition-none ${collapsed ? "" : "rotate-180"}`} />
        </button>
      </div>
      <div id={`${id}-body`} hidden={collapsed} className="transition-[opacity,translate] duration-300 starting:translate-y-1 starting:opacity-0 motion-reduce:transition-none">
        {/* Sur téléphone, la date seule : les bannières portent déjà le contenu, l'encart reste compact */}
        {(date || news.intro) && (
          <p className={`px-4 pt-1 text-sm leading-relaxed text-text-muted ${date ? "" : "max-sm:hidden"}`}>
            {date && <span className="font-bold text-text">{t("updated", { date })}</span>}
            {news.intro && (
              <span className="max-sm:hidden">
                {date && " · "}
                {news.intro}
              </span>
            )}
          </p>
        )}
        <div
          role="region"
          aria-roledescription={t("carouselRole")}
          aria-label={news.title}
          className="px-3 pt-3 pb-1 sm:px-4"
          onPointerEnter={(e) => e.pointerType === "mouse" && setHeld(true)}
          onPointerLeave={(e) => e.pointerType === "mouse" && setHeld(false)}
          onFocusCapture={() => setHeld(true)}
          onBlurCapture={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setHeld(false)}
        >
          <div
            ref={track}
            onScroll={onScroll}
            // Glisser au doigt vaut un choix : l'avance automatique s'arrête
            onTouchStart={() => setPlaying(false)}
            className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain scrollbar-none"
          >
            {news.items.map((item, i) => (
              <NewsBanner key={item.id} item={item} index={i} count={count} active={i === active} first={i === 0} />
            ))}
          </div>
          {count > 1 && (
            <div className="flex items-center justify-center gap-1 py-1">
              <button type="button" aria-label={t("previous")} onClick={() => goTo((active - 1 + count) % count)} className={`${ROUND} max-md:hidden`}>
                <Chevron dir="left" />
              </button>
              <ol className="flex items-center">
                {news.items.map((item, i) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      aria-label={t("goTo", { n: i + 1, title: item.title })}
                      aria-current={i === active || undefined}
                      onClick={() => {
                        setPlaying(false);
                        goTo(i);
                      }}
                      className="group inline-flex size-11 items-center justify-center"
                    >
                      <span
                        aria-hidden="true"
                        className={`block h-2 w-2 rounded-full transition-[transform,background-color] duration-300 motion-reduce:transition-none ${
                          i === active ? "scale-x-[2.6] bg-kin" : "bg-text-muted/45 group-hover:bg-text-muted"
                        }`}
                      />
                    </button>
                  </li>
                ))}
              </ol>
              <button type="button" aria-label={t("next")} onClick={() => goTo((active + 1) % count)} className={`${ROUND} max-md:hidden`}>
                <Chevron dir="right" />
              </button>
              {autoplay && (
                <button type="button" aria-label={playing ? t("pause") : t("play")} onClick={() => setPlaying((p) => !p)} className={ROUND}>
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="size-4">
                    {playing ? <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" /> : <path d="M8 5.5v13l10.5-6.5z" />}
                  </svg>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
