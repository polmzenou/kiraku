"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { PRESTIGE_ASSETS } from "@/lib/prestige/assets";
import { Fuda, type FudaCard } from "../fuda/Fuda";
import { ThemeBackdrop } from "../showcase/ThemeBackdrop";
import "../showcase/showcase.css";
import "./prestige.css";

/** Une carte consacrée, textes déjà traduits et pseudos déjà masqués par le serveur. */
export type Relic = {
  id: string;
  card: FudaCard;
  /** « Consacrée le 4 mai 2028 ». */
  consecrated: string;
  /** « Gardée du cycle 1 au cycle 5 », ou rien. */
  kept: string | null;
  owners: { name: string; username: string | null; via: string }[];
};

/** Places de l'autel : 1, 3 puis 5 cartes, la dernière consacrée en haut. */
const TIERS = [
  { from: 0, to: 1 },
  { from: 1, to: 4 },
  { from: 4, to: 9 },
];
const ON_ALTAR = 9;

/**
 * Sanctuaire du profil : le vrai sanctuaire (fond généré, image fixe et boucle vidéo comme les vitrines), l'autel à
 * gradins avec les 9 dernières cartes consacrées dans leur halo de nacre, les autres au trésor du sanctuaire. Toucher une
 * carte montre son parcours dessous, en fil simple.
 */
export function SanctuaryAltar({ relics, labels }: { relics: Relic[]; labels: { treasure: string; journey: string; hint: string } }) {
  const [selected, setSelected] = useState(0);
  const shown = relics[Math.min(selected, relics.length - 1)];
  const relic = (r: Relic, i: number) => (
    <button key={r.id} type="button" className="pr-relic" aria-pressed={i === selected} aria-label={r.card.name} onClick={() => setSelected(i)}>
      <Fuda card={r.card} size="sm" still />
    </button>
  );
  const treasure = relics.slice(ON_ALTAR);

  return (
    <div className="flex flex-col gap-3">
      <div className="pr-sanctum">
        <ThemeBackdrop media={PRESTIGE_ASSETS.sanctuary} lazy />
        <div className="pr-sanctum-altar">
          {TIERS.map((tier, k) => {
            const cards = relics.slice(tier.from, tier.to);
            if (cards.length === 0) return null;
            return (
              <div key={k} className={`pr-tier t${k + 1}`}>
                {cards.map((r, j) => relic(r, tier.from + j))}
              </div>
            );
          })}
        </div>
      </div>
      {treasure.length > 0 && (
        <div className="flex flex-col gap-2 lacquer rounded-card p-3">
          <h3 className="flex items-center gap-2 text-sm font-bold">
            <span aria-hidden="true" lang="ja" className="grid size-6 place-items-center rounded-[4px] bg-shu-btn font-seal text-sm text-washi-paper">
              宝
            </span>
            {labels.treasure}
          </h3>
          <div className="pr-treasure-grid">{treasure.map((r, j) => relic(r, ON_ALTAR + j))}</div>
        </div>
      )}
      {shown && (
        <div aria-live="polite" className="flex flex-col gap-2 lacquer rounded-card p-3">
          <div className="flex items-center gap-3">
            <div className="w-12 shrink-0">
              <Fuda card={shown.card} size="sm" still />
            </div>
            <div className="flex min-w-0 flex-col">
              <b className="truncate font-title text-base">{shown.card.name}</b>
              <span className="text-xs text-text-muted">{shown.consecrated}</span>
              {shown.kept && <span className="text-xs text-text-muted">{shown.kept}</span>}
            </div>
          </div>
          <p className="text-xs font-bold text-text-muted">{labels.journey}</p>
          <ol className="flex flex-col gap-1.5">
            {shown.owners.map((o, i) => (
              <li key={i} className="min-h-6 border-l-2 border-border pl-3 text-xs leading-6">
                {o.username ? (
                  <Link href={`/u/${o.username}`} className="font-bold text-link underline underline-offset-4">
                    {o.name}
                  </Link>
                ) : (
                  <b>{o.name}</b>
                )}{" "}
                <span className="text-text-muted">· {o.via}</span>
              </li>
            ))}
          </ol>
          {relics.length > 1 && <p className="text-xs text-text-muted">{labels.hint}</p>}
        </div>
      )}
    </div>
  );
}
