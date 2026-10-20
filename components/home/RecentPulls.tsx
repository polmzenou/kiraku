"use client";

import { useRaritySeals } from "@/lib/catalog/use-rarities";

import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";

import { recentPullsAction } from "@/server/actions/home";
import type { RecentPull } from "@/server/home/pulls";
import { Fuda } from "../fuda/Fuda";
import { SectionTitle } from "../SectionTitle";
import { PlayerAvatar } from "../social/PlayerAvatar";

// En dessous, la liste tient à l'écran : pas de défilement automatique
const MARQUEE_MIN = 6;
const SECONDS_PER_CARD = 4;

/**
 * « En direct · Gros tirages » : les dernières Légendaires et Mythiques sorties des boosters, en
 * ruban qui défile sans fin (pause au survol ou au focus). Sans animation, c'est une rangée à faire
 * défiler du doigt. Rafraîchi tant que l'onglet est visible.
 */
export function RecentPulls({ initial, refreshSeconds, serverNow }: { initial: RecentPull[]; refreshSeconds: number; serverNow: number }) {
  const t = useTranslations("home.pulls");
  const [pulls, setPulls] = useState(initial);
  const [now, setNow] = useState(serverNow);

  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      setNow(Date.now());
      const res = await recentPullsAction({});
      if (!stopped && res.ok) setPulls(res.pulls);
    };
    const id = setInterval(() => void tick(), refreshSeconds * 1000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [refreshSeconds]);

  if (pulls.length === 0) return null;
  const marquee = pulls.length >= MARQUEE_MIN;

  return (
    <section aria-labelledby="gros-tirages" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="flex items-center gap-2 text-xs font-bold tracking-wide text-text-muted">
          <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-shu motion-reduce:animate-none" />
          {t("live")}
        </p>
        <SectionTitle id="gros-tirages" kanji="速" title={t("title")} />
      </div>

      <div
        className={`pull-marquee-host -mx-4 px-4 lg:mx-0 lg:px-0 ${
          marquee ? "overflow-hidden motion-reduce:overflow-x-auto" : "overflow-x-auto"
        } [mask-image:linear-gradient(90deg,transparent,#000_1rem,#000_calc(100%-1rem),transparent)] [scrollbar-width:thin]`}
      >
        <div
          className={`flex w-max gap-3 py-1 ${marquee ? "pull-marquee motion-reduce:[animation:none]" : ""}`}
          style={marquee ? ({ "--marquee-duration": `${pulls.length * SECONDS_PER_CARD}s` } as React.CSSProperties) : undefined}
        >
          <PullList pulls={pulls} now={now} />
          {/* Deuxième passage pour la boucle : invisible aux lecteurs d'écran et au clavier */}
          {marquee && (
            <div aria-hidden="true" inert className="flex gap-3 motion-reduce:hidden">
              <PullList pulls={pulls} now={now} />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function PullList({ pulls, now }: { pulls: RecentPull[]; now: number }) {
  const RARITY_SEAL = useRaritySeals();
  const t = useTranslations("home.pulls");
  const tRarity = useTranslations("rarity");
  const format = useFormatter();
  return (
    <ul className="flex gap-3" aria-label={t("listLabel")}>
      {pulls.map((p) => (
        <li key={p.id} className="flex w-32 shrink-0 flex-col gap-2 sm:w-36">
          <Link href={`/wiki/${p.card.anilistId}`} aria-label={t("cardLabel", { name: p.card.name, rarity: tRarity(p.card.rarity) })}>
            <Fuda card={p.card} series={p.card.series} size="sm" tilt={false} sizes="144px" />
          </Link>
          <div className="flex min-w-0 items-center gap-2">
            {p.profile ? (
              <Link href={`/u/${p.profile.username}`} className="flex min-h-11 min-w-0 items-center gap-2">
                <PlayerAvatar username={p.profile.username} image={p.profile.image} size={28} />
                <span className="truncate text-sm font-bold">{p.name}</span>
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
