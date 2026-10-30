"use client";

import { useFormatter, useTranslations } from "next-intl";
import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";
import { BoosterArt } from "@/components/boosters/BoosterArt";
import { Fuda } from "@/components/fuda/Fuda";
import { Link } from "@/i18n/navigation";
import { NEWS_ICONS, type NewsCardView, type NewsIcon, type NewsItemView, type NewsTone, type NewsVisualView } from "@/lib/home/news";
import "./news.css";

// Motif wagara de chaque couleur ; un booster garde le sien
const PATTERN: Record<NewsTone, string> = { kin: "asanoha", shu: "seigaiha", ai: "kikko", hisui: "sakura", neutral: "ichimatsu" };

const CTA =
  "inline-flex min-h-11 items-center gap-2 rounded-xl bg-shu-btn px-5 text-sm font-bold text-washi-paper shadow-[0_6px_18px_rgb(0_0_0/0.35)] transition-colors hover:bg-shu";

/** Éventail de cartes tenu en main, qui s'ouvre quand la bannière devient active. */
function CardFan({ cards, active, behind = false }: { cards: NewsCardView[]; active: boolean; behind?: boolean }) {
  return (
    <ul aria-hidden="true" className={`relative ${behind ? "h-36 w-52" : "h-40 w-60 sm:h-52 sm:w-80"}`}>
      {cards.map((card, index) => {
        const offset = index - (cards.length - 1) / 2;
        return (
          <li
            key={card.id}
            // Chaque carte pivote autour d'un point sous le paquet ; les cartes figées hors de la bannière active
            style={{ "--r": `${offset * (behind ? 16 : 10)}deg`, zIndex: 10 - Math.abs(Math.round(offset)) } as CSSProperties}
            className={`absolute bottom-0 left-1/2 origin-[50%_230%] transition-[rotate,translate] duration-700 ease-out motion-reduce:transition-none ${
              behind ? "-ml-10 w-20" : "-ml-11 w-22 sm:-ml-14 sm:w-28"
            } ${active ? "[rotate:var(--r)]" : "[rotate:0deg]"} ${offset === 0 && !behind && active ? "-translate-y-2" : ""}`}
          >
            <Fuda card={card} size="sm" tilt={false} still={!active} sizes="112px" />
          </li>
        );
      })}
    </ul>
  );
}

/** Le sachet du booster, incliné et flottant, devant ses cartes vedettes (bannière) en éventail. */
function BoosterVisual({ visual, active }: { visual: Extract<NewsVisualView, { kind: "booster" }>; active: boolean }) {
  const { booster, cards } = visual;
  return (
    <div aria-hidden="true" className="relative flex h-48 w-60 items-end justify-center sm:h-56 sm:w-72">
      {cards.length > 0 && (
        <div className="absolute inset-x-0 bottom-10 flex justify-center opacity-90">
          <CardFan cards={cards} active={active} behind />
        </div>
      )}
      <div className="news-float relative w-28 -rotate-6 sm:w-32">
        <BoosterArt shape={booster.shape} theme={booster.theme} emblem={booster.emblem} name={booster.name} contents="" compact />
      </div>
    </div>
  );
}

/** Le sceau de la nouveauté en grand, tamponné sur le motif. */
function SealVisual({ icon }: { icon: NewsIcon }) {
  return (
    <span
      aria-hidden="true"
      lang="ja"
      className="grid size-28 -rotate-6 place-items-center rounded-[22px] border-2 border-white/25 bg-black/25 font-seal text-7xl leading-none text-[var(--nb-seal)] shadow-[inset_0_0_0_6px_rgb(0_0_0/0.18),0_12px_30px_rgb(0_0_0/0.35)] sm:size-36 sm:text-8xl"
    >
      {NEWS_ICONS[icon]}
    </span>
  );
}

/**
 * Une bannière du carrousel : fond dans la couleur de la nouveauté (ou celle du booster), visuel (cartes
 * en éventail, sachet, image ou grand sceau), étiquette, titre, texte et bouton. Un booster sans bouton
 * choisi mène à sa vitrine sur l'accueil (?b=).
 */
export function NewsBanner({ item, index, count, active, first }: { item: NewsItemView; index: number; count: number; active: boolean; first: boolean }) {
  const t = useTranslations("news");
  const format = useFormatter();
  const { visual } = item;
  const booster = visual.kind === "booster" ? visual.booster : null;
  const style = booster ? ({ "--nb-base": booster.theme.base, "--nb-dark": booster.theme.dark } as CSSProperties) : undefined;
  const until = booster?.endsAt ? format.dateTime(new Date(booster.endsAt), { day: "numeric", month: "long", timeZone: "Europe/Paris" }) : null;
  const link = item.link.kind === "none" && booster ? { kind: "internal" as const, href: `/?b=${booster.slug}`, label: t("openBooster") } : item.link;

  let art: ReactNode = null;
  if (visual.kind === "cards") art = <CardFan cards={visual.cards} active={active} />;
  else if (visual.kind === "booster") art = <BoosterVisual visual={visual} active={active} />;
  else if (visual.kind === "none" && item.icon) art = <SealVisual icon={item.icon} />;

  return (
    <article
      role="group"
      aria-roledescription={t("slideRole")}
      aria-label={t("slide", { n: index + 1, count })}
      data-tone={item.tone}
      data-kind={visual.kind}
      data-active={active || undefined}
      style={style}
      className={`news-banner wagara-${booster?.theme.pattern ?? PATTERN[item.tone]} relative isolate flex min-h-[23rem] w-full shrink-0 snap-center flex-col justify-end overflow-hidden rounded-xl md:grid md:min-h-[17.5rem] md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-6`}
    >
      {visual.kind === "image" && (
        <>
          <Image
            src={visual.url}
            alt=""
            fill
            sizes="(min-width: 1232px) 1168px, 100vw"
            preload={first}
            className="-z-20 object-cover"
            style={{ objectPosition: `${visual.focalX}% ${visual.focalY}%` }}
          />
          <span aria-hidden="true" className="news-veil absolute inset-0 -z-10" />
        </>
      )}
      <span aria-hidden="true" className="news-sheen pointer-events-none absolute inset-0 -z-10" />
      {art && <div className="flex justify-center px-5 pt-5 md:order-last md:pt-0 md:pr-10 md:pl-0">{art}</div>}
      <div className="flex min-w-0 flex-col items-start gap-2.5 px-5 pt-4 pb-6 md:py-8 md:pl-10">
        {item.tag && (
          <p className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-black/30 px-3 py-1 text-[11px] font-bold tracking-[0.12em] text-white/90 uppercase">
            {item.icon && visual.kind !== "none" && (
              <span aria-hidden="true" lang="ja" className="font-seal text-sm leading-none tracking-normal text-[var(--nb-seal)]">
                {NEWS_ICONS[item.icon]}
              </span>
            )}
            {t(`tags.${item.tag}`)}
          </p>
        )}
        <h3 className="font-heading text-2xl leading-tight text-balance [text-shadow:0_2px_12px_rgb(0_0_0/0.45)] sm:text-3xl lg:text-4xl">{item.title}</h3>
        <p className="max-w-prose text-sm leading-relaxed whitespace-pre-line text-white/80">{item.body}</p>
        {until && <p className="rounded-full bg-black/35 px-3 py-1 text-xs font-bold text-[var(--nb-seal)]">{t("until", { date: until })}</p>}
        {link.kind === "internal" && (
          <Link href={link.href} className={`mt-1 ${CTA}`}>
            {link.label} <span aria-hidden="true">→</span>
          </Link>
        )}
        {link.kind === "external" && (
          <a href={link.href} target="_blank" rel="noopener noreferrer" className={`mt-1 ${CTA}`}>
            {link.label} <span aria-hidden="true">↗</span>
            <span className="sr-only">{t("newTab")}</span>
          </a>
        )}
      </div>
    </article>
  );
}
