"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Link } from "@/i18n/navigation";
import { NEWS_ICONS, type NewsItemView, type NewsTone, type NewsView } from "@/lib/home/news";
import { rememberNewsCollapsed } from "@/lib/home/news-dom";

// Teinte de chaque nouveauté : bordure et fond légers, sceau dans la couleur
const TONES: Record<NewsTone, { card: string; seal: string }> = {
  kin: { card: "border-kin/45 bg-kin/8", seal: "text-link" },
  shu: { card: "border-shu/35 bg-shu/6", seal: "text-shu" },
  ai: { card: "border-ai/35 bg-ai/8", seal: "text-ai" },
  hisui: { card: "border-hisui/40 bg-hisui/8", seal: "text-hisui" },
  neutral: { card: "border-border bg-surface/60", seal: "text-text-muted" },
};

const CTA =
  "mt-auto inline-flex min-h-11 items-center gap-2 self-start rounded-xl border border-border bg-bg/60 px-4 text-sm font-bold transition-colors hover:bg-surface-2";

function NewsCard({ item }: { item: NewsItemView }) {
  const t = useTranslations("news");
  const tone = TONES[item.tone];
  return (
    <li className={`flex w-[82%] max-w-80 shrink-0 snap-start flex-col gap-2 rounded-2xl border p-4 md:w-auto md:max-w-none ${tone.card}`}>
      <h3 className="flex items-center gap-2 text-sm font-bold">
        {item.icon && (
          <span aria-hidden="true" lang="ja" className={`font-seal text-lg leading-none ${tone.seal}`}>
            {NEWS_ICONS[item.icon]}
          </span>
        )}
        {item.title}
      </h3>
      <p className="text-xs leading-relaxed whitespace-pre-line text-text-muted">{item.body}</p>
      {item.link.kind === "internal" && (
        <Link href={item.link.href} className={CTA}>
          {item.link.label} <span aria-hidden="true">→</span>
        </Link>
      )}
      {item.link.kind === "external" && (
        <a href={item.link.href} target="_blank" rel="noopener noreferrer" className={CTA}>
          {item.link.label} <span aria-hidden="true">↗</span>
          <span className="sr-only">{t("newTab")}</span>
        </a>
      )}
    </li>
  );
}

/**
 * Encart « Nouveautés » de l'accueil : les dernières infos importantes, réglées dans /admin/nouveautes.
 * Réduit, il tient sur une ligne ; le choix est gardé pour cette publication (cookie lu par le serveur,
 * sans saut au chargement), et une nouvelle publication le rouvre. `preview` : aperçu de l'admin, qui
 * ne touche pas à la préférence du joueur.
 */
export function NewsPanelView({ news, initialCollapsed, preview = false }: { news: NewsView; initialCollapsed: boolean; preview?: boolean }) {
  const t = useTranslations("news");
  const format = useFormatter();
  const id = useId();
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const date = news.publishedAt ? format.dateTime(new Date(news.publishedAt), { day: "numeric", month: "long", timeZone: "Europe/Paris" }) : null;

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    if (!preview) rememberNewsCollapsed(next ? news.revision : null);
  };

  return (
    <section aria-labelledby={`${id}-title`} className="relative isolate overflow-hidden rounded-2xl border border-kin/30 bg-surface/50">
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
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`size-4 transition-transform motion-reduce:transition-none ${collapsed ? "" : "rotate-180"}`}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </div>
      <div id={`${id}-body`} hidden={collapsed} className="transition-[opacity,translate] duration-300 starting:translate-y-1 starting:opacity-0 motion-reduce:transition-none">
        {(date || news.intro) && (
          <p className="px-4 pt-1 text-sm leading-relaxed text-text-muted">
            {date && <span className="font-bold text-text">{t("updated", { date })}</span>}
            {date && news.intro && " · "}
            {news.intro}
          </p>
        )}
        <ul className="flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto overscroll-x-contain px-4 pt-3 pb-4 scrollbar-none md:grid md:grid-cols-2 md:overflow-visible lg:grid-cols-3">
          {news.items.map((item) => (
            <NewsCard key={item.id} item={item} />
          ))}
        </ul>
      </div>
    </section>
  );
}
