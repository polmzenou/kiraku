import { useTranslations } from "next-intl";
import { ButtonLink } from "../ui/ButtonLink";
import { BoosterArt, type BoosterArtProps } from "./BoosterArt";

export type CreditedBooster = Pick<BoosterArtProps, "shape" | "theme" | "emblem" | "contents"> & {
  slug: string;
  name: string;
  count: number;
};

/**
 * Boosters crédités (cadeaux d'amis, boutique, récompenses) sur l'accueil, à ouvrir en premier.
 * Un seul type : une ligne. Dès deux (un pack de la boutique en crédite plusieurs), un bandeau de
 * tuiles compactes qui défile à l'horizontale.
 */
export function CreditStrip({ credits }: { credits: CreditedBooster[] }) {
  const t = useTranslations("boosters");
  if (credits.length === 0) return null;
  const href = (c: CreditedBooster) => `/ouvrir/${c.slug}?credit=1`;

  if (credits.length === 1) {
    return (
      <ul className="flex flex-col gap-2">
        {credits.map((c) => (
          <li key={c.slug} className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-kin bg-surface p-4">
            <p className="flex items-center gap-2 font-bold">
              <span aria-hidden="true" lang="ja" className="font-seal text-xl text-kin">
                贈
              </span>
              {t("creditBoosters", { count: c.count, name: c.name })}
            </p>
            <ButtonLink href={href(c)} variant="primary">
              {t("openCredit")}
            </ButtonLink>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section aria-labelledby="credits-title" className="flex flex-col gap-2">
      <h2 id="credits-title" className="flex items-center gap-2 font-title text-lg font-bold">
        <span aria-hidden="true" lang="ja" className="font-seal text-xl text-kin">
          贈
        </span>
        {t("creditTitle")}
      </h2>
      {/* Bandeau glissable : le geste ne doit pas changer d'onglet. scroll-px aligne l'aimantation sur la gouttière. */}
      <ul data-swipe-ignore className="-mx-4 flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 pb-2 scrollbar-thin">
        {credits.map((c) => (
          <li key={c.slug} className="flex w-38 shrink-0 snap-start flex-col gap-2 rounded-card border border-kin/60 bg-surface p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="w-12 shrink-0">
                <BoosterArt shape={c.shape} theme={c.theme} emblem={c.emblem} name={c.name} contents={c.contents} compact flatShadow />
              </div>
              {/* Le nombre est redit en entier dans le lien */}
              <span aria-hidden="true" className="rounded-pill border border-kin/60 bg-bg/80 px-2 py-0.5 text-sm font-bold text-kin tabular-nums">
                {t("creditCount", { count: c.count })}
              </span>
            </div>
            <p className="line-clamp-2 text-sm font-bold">{c.name}</p>
            {/* « Ouvrir » répété d'une tuile à l'autre : le lien porte le type et le nombre pour les lecteurs d'écran */}
            <ButtonLink href={href(c)} variant="primary" className="mt-auto w-full">
              <span aria-hidden="true">{t("openCredit")}</span>
              <span className="sr-only">{t("openCreditLabel", { count: c.count, name: c.name })}</span>
            </ButtonLink>
          </li>
        ))}
      </ul>
    </section>
  );
}
