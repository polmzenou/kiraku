import { useTranslations } from "next-intl";
import type { CSSProperties, ReactNode } from "react";
import type { ShopCard } from "@/lib/economy/shop-view";
import type { LotView } from "@/server/economy/lot-view";
import { BoosterArt } from "../boosters/BoosterArt";
import { badgeClasses } from "../ui/Badge";
import { PackPrice, ResetHint } from "./PackPrice";

/**
 * Vedette du jour : le pack choisi par le serveur, en grand, aux couleurs et au wagara de son type.
 * Le sachet flotte dans son halo, entouré de rayons (en pause en effets allégés). Tout le texte est
 * posé sur un panneau opaque : l'encre sur la couleur du type ne serait pas lisible pour tous les types.
 */
export function FeaturedPack({
  card,
  affordable,
  buy,
  countdown,
  now,
}: {
  card: ShopCard<LotView>;
  affordable: boolean;
  buy: ReactNode;
  countdown: ReactNode;
  now: Date;
}) {
  const t = useTranslations("economy.shop");
  const line = card.lot.lines.find((l) => l.kind === "BOOSTER");
  if (line?.kind !== "BOOSTER") return null;
  const { theme } = line.look;
  const vars = { "--booster-base": theme.base, "--booster-dark": theme.dark } as CSSProperties;
  const titleId = `vedette-${card.id}-title`;

  return (
    <section aria-labelledby={titleId} className="shop-hero relative isolate overflow-hidden rounded-hero border border-kin/40">
      <span aria-hidden="true" className={`showcase-layer wagara-${theme.pattern} absolute inset-0 -z-10`} data-ink={theme.ink} style={vars} />
      <div className="grid grid-cols-[38%_minmax(0,1fr)] items-center gap-3 p-3 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-8 sm:p-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <div aria-hidden="true" className="shop-hero-art pointer-events-none mx-auto w-full max-w-36 py-4 sm:max-w-48">
          <span className="shop-hero-rays light-rays" style={{ "--leak": `color-mix(in oklab, ${theme.base} 45%, #fff3d6)` } as CSSProperties} />
          <span className="absolute inset-0 -z-1" style={{ "--halo": theme.base } as CSSProperties}>
            <span className="booster-halo booster-halo-breathe" />
            <span className="booster-floor booster-floor-float" />
          </span>
          <div className="booster-idle">
            <BoosterArt shape={line.look.shape} theme={theme} emblem={line.look.emblem} name={line.name} contents={line.look.contents} flatShadow />
          </div>
        </div>

        {/* Au-dessus des rayons et du halo qui débordent de la colonne du sachet */}
        <div className="relative z-10 flex min-w-0 flex-col gap-2 rounded-control bg-bg/85 p-3 text-text sm:gap-3 sm:p-5">
          <p className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-kin">
            <span aria-hidden="true" lang="ja" className="font-seal text-base">
              選
            </span>
            {t("featured.label")}
          </p>
          <h2 id={titleId} className="font-heading text-xl leading-tight sm:text-3xl">
            {card.name}
          </h2>
          {card.description && <p className="hidden text-sm text-text-muted sm:block">{card.description}</p>}
          <div className="flex flex-wrap items-center gap-1.5">
            {card.discount !== null && (
              <span aria-hidden="true" className={badgeClasses("shu")}>
                {t("discount", { discount: card.discount })}
              </span>
            )}
            {card.limit && (
              <span className={`text-xs ${card.remaining === 0 ? "font-bold text-shu" : "text-text-muted"}`}>
                {t(`limit.${card.limit.period}`, { count: card.remaining ?? 0, limit: card.limit.perUser })}
              </span>
            )}
          </div>
          <PackPrice price={card.price} reference={card.reference} discount={card.discount} affordable={affordable} size="lg" />
          {buy}
          {card.remaining === 0 ? <ResetHint resetsAt={card.limit?.resetsAt ?? null} now={now} /> : countdown}
        </div>
      </div>
    </section>
  );
}
