"use client";

import { useTranslations } from "next-intl";
import type { BattleSetup, Side } from "@/lib/battle/types";
import { resolveAppearance } from "@/lib/catalog/appearance";
import type { Banner, CutIn as CutInState } from "../stage/useDirector";

/**
 * Cut-in de technique : un bandeau oblique traverse l'écran avec l'image de la carte et le nom traduit
 * de la technique en grand. Complet au premier lancer d'une carte, bref ensuite. Venu de la gauche pour
 * son propre camp, de la droite pour l'adversaire. Un ulti a toujours le sien en complet, sur un bandeau doré.
 */
export function CutIn({ cutin, setup, mySide }: { cutin: CutInState; setup: BattleSetup; mySide: Side }) {
  const t = useTranslations("battle");
  const card = setup.teams[cutin.actor.side][cutin.actor.index];
  const look = resolveAppearance(undefined, card.appearance);
  const mine = cutin.actor.side === mySide;
  const ultimate = "ultimate" in cutin ? cutin.ultimate : null;
  const name = "ultimate" in cutin ? t(`ultimates.${cutin.ultimate}.name`) : t(`techniques.${cutin.technique}.name`);
  // Le titre se règle sur son mot le plus long (« Encouragement ») : les mots passent à la ligne, jamais hors du bandeau
  const fit = Math.max(...name.split(/\s+/).map((w) => w.length));
  return (
    <div
      key={cutin.id}
      aria-hidden="true"
      className="cutin"
      data-side={mine ? "mine" : "theirs"}
      data-full={cutin.full || undefined}
      data-ult={ultimate ? true : undefined}
      style={{ ["--ms" as string]: `${Math.round(cutin.ms)}ms` }}
    >
      <div className="cutin-band">
        <span className="cutin-lines" />
        <span className="cutin-art">
          {/* eslint-disable-next-line @next/next/no-img-element -- image déjà chargée par la carte, recadrée au point focal */}
          <img src={card.imageUrl} alt="" draggable={false} style={{ objectPosition: `${look.focalX}% ${look.focalY}%` }} />
        </span>
        <span className="cutin-text">
          {ultimate && <small className="cutin-kicker">{t("board.ultimateKicker")}</small>}
          <b className="cutin-name" style={{ ["--fit" as string]: fit }}>
            {name}
          </b>
          <small>{card.name}</small>
        </span>
      </div>
    </div>
  );
}

/** Bannière du tour : un trait de pinceau traverse la ligne de front. */
export function TurnBanner({ banner, mySide, theirName }: { banner: Banner; mySide: Side; theirName: string }) {
  const t = useTranslations("battle.board");
  const mine = banner.side === mySide;
  return (
    <div key={banner.id} className="turn-banner" data-side={mine ? "mine" : "theirs"} style={{ ["--ms" as string]: `${Math.round(banner.ms)}ms` }}>
      <span className="turn-banner-stroke" aria-hidden="true" />
      <span className="turn-banner-text">{mine ? t("yourTurn") : t("theirTurn", { name: theirName })}</span>
    </div>
  );
}
