"use client";

import { useRaritySeals } from "@/lib/catalog/use-rarities";

import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";

import { recentPullsAction } from "@/server/actions/home";
import type { RecentPull } from "@/server/home/pulls";
import { OwnedBadge } from "../collection/OwnedBadge";
import { Fuda } from "../fuda/Fuda";
import { SectionTitle } from "../SectionTitle";
import { useReducedFx } from "../motion/MotionPreference";
import { usePoll } from "../realtime/usePoll";
import { PlayerAvatar } from "../social/PlayerAvatar";
import { PlayerName } from "../social/PlayerName";
import { useMarquee } from "./useMarquee";

// En dessous, la liste tient à l'écran : pas de défilement automatique
const MARQUEE_MIN = 6;
const SECONDS_PER_CARD = 4;

/**
 * « En direct · Gros tirages » : les dernières Légendaires et Mythiques sorties des boosters, en
 * ruban qui défile sans fin et qu'on peut faire glisser (pause au survol ou au focus). Sans
 * animation, c'est une rangée à faire défiler du doigt. Rafraîchi tant qu'il est à l'écran et le joueur là.
 */
export function RecentPulls({ initial, initialOwned, refreshSeconds, serverNow }: {
  initial: RecentPull[];
  /** Cartes du ruban que le visiteur a déjà (pastille « Acquise »). */
  initialOwned: string[];
  refreshSeconds: number;
  serverNow: number;
}) {
  const t = useTranslations("home.pulls");
  const [pulls, setPulls] = useState(initial);
  const [owned, setOwned] = useState(() => new Set(initialOwned));
  const [now, setNow] = useState(serverNow);
  const reduced = useReducedFx();
  const marquee = pulls.length >= MARQUEE_MIN && !reduced;
  // Sondé et animé seulement quand le ruban est à l'écran (et le joueur là) ; sans nouveau tirage, plus lentement
  const section = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);
  const { track, handlers: drag } = useMarquee<HTMLDivElement>({ enabled: marquee, periodSeconds: pulls.length * SECONDS_PER_CARD, paused: !inView });
  useEffect(() => {
    const el = section.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry?.isIntersecting ?? false));
    observer.observe(el);
    return () => observer.disconnect();
  }, [pulls.length]);
  const first = useRef(initial[0]?.id);
  const refresh = useCallback(async () => {
    setNow(Date.now());
    const res = await recentPullsAction({});
    if (!res.ok) return false;
    setPulls(res.pulls);
    setOwned(new Set(res.owned));
    const changed = res.pulls[0]?.id !== first.current;
    first.current = res.pulls[0]?.id;
    return changed;
  }, []);
  usePoll(refresh, { seconds: refreshSeconds, enabled: inView, backoff: true });

  if (pulls.length === 0) return null;

  return (
    <section ref={section} aria-labelledby="gros-tirages" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="flex items-center gap-2 text-xs font-bold tracking-wide text-text-muted">
          <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-shu motion-reduce:animate-none" />
          {t("live")}
        </p>
        <SectionTitle id="gros-tirages" kanji="速" title={t("title")} />
      </div>

      <div
        {...(marquee ? drag : {})}
        // Bandeau glissable : le geste ne doit pas changer d'onglet
        data-swipe-ignore
        className={`-mx-4 px-4 lg:mx-0 lg:px-0 ${
          marquee ? "cursor-grab touch-pan-y overflow-hidden select-none active:cursor-grabbing motion-reduce:overflow-x-auto" : "overflow-x-auto"
        } [mask-image:linear-gradient(90deg,transparent,#000_1rem,#000_calc(100%-1rem),transparent)] [scrollbar-width:thin]`}
      >
        <div ref={track} className="flex w-max gap-3 py-1 will-change-transform">
          <PullList pulls={pulls} owned={owned} now={now} />
          {/* Deuxième passage pour la boucle : invisible aux lecteurs d'écran et au clavier, mais
              cliquable (pas d'`inert`, qui ignorerait les appuis quand cette copie est à l'écran) */}
          {marquee && (
            <div aria-hidden="true" className="flex gap-3 motion-reduce:hidden">
              <PullList pulls={pulls} owned={owned} now={now} copy />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function PullList({ pulls, owned, now, copy = false }: { pulls: RecentPull[]; owned: ReadonlySet<string>; now: number; copy?: boolean }) {
  const RARITY_SEAL = useRaritySeals();
  const t = useTranslations("home.pulls");
  const tRarity = useTranslations("rarity");
  const format = useFormatter();
  const tabIndex = copy ? -1 : undefined;
  return (
    <ul className="flex gap-3" aria-label={t("listLabel")}>
      {pulls.map((p) => (
        <li key={p.id} className="flex w-32 shrink-0 flex-col gap-2 sm:w-36">
          <Link prefetch={false} href={`/wiki/${p.card.anilistId}`} tabIndex={tabIndex} aria-label={t("cardLabel", { name: p.card.name, rarity: tRarity(p.card.rarity) })}>
            <Fuda card={p.card} series={p.card.series} size="sm" tilt={false} sizes="144px" describeImage corner={owned.has(p.card.cardId) && <OwnedBadge />} />
          </Link>
          <div className="flex min-w-0 items-center gap-2">
            {p.profile ? (
              <Link prefetch={false} href={`/u/${p.profile.username}`} tabIndex={tabIndex} className="flex min-h-11 min-w-0 items-center gap-2">
                <PlayerAvatar username={p.profile.username} image={p.profile.image} size={28} frame={p.profile.decor.frame} />
                <PlayerName name={p.name} color={p.profile.decor.nameColor} className="truncate text-sm font-bold" />
              </Link>
            ) : (
              <span className="flex min-h-11 min-w-0 items-center gap-2 text-text-muted">
                <span aria-hidden="true" lang="ja" className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border font-seal text-sm">
                  {RARITY_SEAL[p.card.rarity]}
                </span>
                <span className="truncate text-sm">{p.name}</span>
              </span>
            )}
          </div>
          <time dateTime={p.at} className="-mt-2 text-xs text-text-muted">
            {format.relativeTime(new Date(p.at), now)}
          </time>
        </li>
      ))}
    </ul>
  );
}
