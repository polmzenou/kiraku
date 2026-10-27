import { useTranslations } from "next-intl";
import type { CSSProperties, ReactNode } from "react";
import type { ShopCard } from "@/lib/economy/shop-view";
import type { LotView } from "@/server/economy/lot-view";
import { LotRewards } from "../economy/LotRewards";
import { LotStage } from "../economy/LotStage";
import { badgeClasses } from "../ui/Badge";
import { ButtonLink } from "../ui/ButtonLink";
import { KiraSparkles, PackFan } from "./PackFan";
import { PackPrice, ResetHint } from "./PackPrice";

/** Motif seigaiha doré en filigrane derrière l'éventail (comme LotStage). */
const PATTERN = { background: "var(--wagara)", "--wl": "rgb(217 181 86 / 0.35)" } as CSSProperties;

/** Id du titre d'une carte de la grille (la vedette a le sien : le même article y paraît deux fois). */
export function packTitleId(id: string) {
  return `pack-${id}-title`;
}

/**
 * Carte d'un article : scène neutre en laque et éventail de sachets à gauche en mobile (carte
 * compacte), au-dessus dès sm. La couleur du type ne vit que sur les sachets et un filet. Le bouton
 * d'achat est rendu par la page (îlot client), un bouton d'aperçu sur /boutique/apercu.
 */
export function PackCard({
  card,
  affordable,
  buy,
  now,
  enterIndex,
}: {
  card: ShopCard<LotView>;
  affordable: boolean;
  buy: ReactNode;
  now: Date;
  /** Les premières cartes entrent en cascade. */
  enterIndex?: number;
}) {
  const t = useTranslations("economy.shop");
  const tb = useTranslations("boosters");
  const line = card.lot.lines.find((l) => l.kind === "BOOSTER");
  const titleId = packTitleId(card.id);
  const soldOut = card.remaining === 0;

  return (
    <li
      className={enterIndex !== undefined ? "shop-enter" : undefined}
      style={enterIndex !== undefined ? ({ "--i": enterIndex } as CSSProperties) : undefined}
    >
      <article aria-labelledby={titleId} className="shop-pack lacquer flex h-full rounded-card sm:flex-col">
        <div className="relative isolate w-[38%] shrink-0 overflow-hidden rounded-l-card bg-[radial-gradient(ellipse_at_50%_60%,var(--color-surface-2)_0%,var(--color-bg)_80%)] sm:h-44 sm:w-auto sm:rounded-none sm:rounded-t-card">
          {line?.kind === "BOOSTER" ? (
            <>
              <span aria-hidden="true" className="wagara-seigaiha absolute inset-0 opacity-25" style={PATTERN} />
              <span aria-hidden="true" className="absolute inset-x-0 top-0 h-0.75 opacity-80" style={{ background: line.look.theme.base }} />
              <div className="shop-tilt absolute inset-0 px-2 py-4">
                <PackFan look={line.look} name={line.name} quantity={line.quantity} className="[--fan-w:56%] sm:[--fan-w:30%]" />
              </div>
              <KiraSparkles />
            </>
          ) : (
            <LotStage lot={card.lot} className="absolute inset-0" />
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2 p-3 sm:gap-2.5 sm:p-4">
          <div className="flex flex-wrap items-center gap-1.5">
            {line?.kind === "BOOSTER" && line.quantity > 1 && (
              <span aria-hidden="true" className={badgeClasses("kin")}>
                {t("quantity", { count: line.quantity })}
              </span>
            )}
            {card.discount !== null && (
              <span aria-hidden="true" className={badgeClasses("shu")}>
                {t("discount", { discount: card.discount })}
              </span>
            )}
            {card.featured && (
              <span className="inline-flex min-h-5 items-center rounded-pill border border-kin/50 px-1.5 text-[11px] leading-none font-bold text-kin">
                {t("featured.badge")}
              </span>
            )}
            {card.endsSoon && <span className={badgeClasses("shu")}>{t("endsSoon")}</span>}
          </div>
          <h3 id={titleId} className="font-title text-base leading-tight font-extrabold sm:text-lg">
            {card.name}
          </h3>
          {card.description && <p className="line-clamp-2 text-xs text-text-muted sm:text-sm">{card.description}</p>}
          {!card.booster && <LotRewards lot={card.lot} />}

          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-muted">
            {card.booster && <span>{t("pack.pool", { count: card.booster.poolSize })}</span>}
            {card.limit && (
              <span className={soldOut ? "font-bold text-shu" : ""}>
                {t(`limit.${card.limit.period}`, { count: card.remaining ?? 0, limit: card.limit.perUser })}
              </span>
            )}
            {card.booster?.resting && <span className="text-ai">{t("pack.resting")}</span>}
            {card.endsAt && <span>{t("until", { date: card.endsAt })}</span>}
          </div>
          {soldOut && <ResetHint resetsAt={card.limit?.resetsAt ?? null} now={now} />}
          {card.booster && card.booster.owned > 0 && (
            <p className="flex flex-wrap items-center gap-2 text-xs font-bold text-kin">
              <span lang="ja" aria-hidden="true" className="font-seal text-sm">
                贈
              </span>
              {t("pack.owned", { count: card.booster.owned })}
              <ButtonLink
                href={`/ouvrir/${card.booster.slug}?credit=1`}
                size="sm"
                variant="ghost"
                aria-describedby={titleId}
              >
                {tb("openCredit")}
              </ButtonLink>
            </p>
          )}

          <div className="mt-auto flex flex-col gap-2 border-t border-dashed border-border pt-2 sm:pt-3">
            <PackPrice price={card.price} reference={card.reference} discount={card.discount} affordable={affordable} />
            {buy}
          </div>
        </div>
      </article>
    </li>
  );
}
