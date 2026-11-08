import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { SectionTitle } from "@/components/SectionTitle";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { Link } from "@/i18n/navigation";
import type { ShowcaseCard } from "@/lib/collection/view";
import type { ShowcaseLayoutId } from "@/lib/showcase/layouts";
import { SHOWCASE_THEMES, type ShowcaseThemeId } from "@/lib/showcase/theme-registry";
import { MakeMainButton } from "./MakeMainButton";
import { ShowcaseView } from "./ShowcaseView";
import "./showcase.css";

export type ShelfShowcase = {
  id: string;
  name: string;
  layout: ShowcaseLayoutId;
  /** Thème affiché (déjà ramené à Sans décor s'il n'est plus disponible). */
  theme: ShowcaseThemeId;
  count: number;
};

/** Cartel de la vitrine principale, sous ses cartes : sceau du décor, nom, disposition et lien. */
function MainPlate({ showcase, href, isOwner }: { showcase: ShelfShowcase; href: string; isOwner: boolean }) {
  const t = useTranslations("showcase");
  const def = SHOWCASE_THEMES[showcase.theme];
  return (
    <div className="vt-plate flex flex-col items-center gap-3 text-center">
      <div className="flex max-w-full min-w-0 flex-col items-center gap-0.5">
        {def.media && (
          <span aria-hidden="true" lang="ja" className="vt-seal mb-1.5" data-vt-tone={showcase.theme}>
            {def.kanji}
          </span>
        )}
        {isOwner && <p className="text-xs font-bold tracking-wide text-kin">{t("featured")}</p>}
        <h3 className="max-w-full truncate font-title text-xl font-extrabold">{showcase.name}</h3>
        <p className="text-xs text-text-muted">
          {t("meta", { count: showcase.count, layout: t(`layouts.${showcase.layout}.name`) })}
          {showcase.theme !== "none" && <> · {t(`themes.${showcase.theme}.name`)}</>}
        </p>
      </div>
      <ButtonLink href={href} size="sm" prefetch={false}>
        {isOwner ? t("openOwner") : t("open")}
      </ButtonLink>
    </div>
  );
}

/**
 * Section Vitrines du profil. Tout le monde voit la vitrine principale (la première), en scène ouverte
 * avec son cartel dessous. Son propriétaire voit en plus ses autres vitrines, privées, sur une étagère
 * où chacune montre son décor : les ouvrir, ou afficher l'une d'elles à la place de la principale. Les
 * autres joueurs ne reçoivent jamais ces vitrines privées.
 */
export function ProfileShowcases({
  username,
  isOwner,
  showcases,
  mainCards,
  owned,
  linkBase,
  create,
}: {
  username: string;
  isOwner: boolean;
  /** Propriétaire : toutes ses vitrines ; visiteur : la principale seulement. */
  showcases: readonly ShelfShowcase[];
  /** Cartes de la vitrine principale, case par case. */
  mainCards: readonly (ShowcaseCard | null)[];
  owned: readonly string[];
  linkBase: "/collection" | "/wiki";
  /** Bouton « Nouvelle vitrine » (propriétaire, sous le maximum). */
  create?: ReactNode;
}) {
  const t = useTranslations("showcase");
  const [main, ...others] = showcases;
  const href = (id: string) => `/u/${username}/vitrines/${id}`;
  const ids = showcases.map((s) => s.id);

  return (
    <section className="flex flex-col gap-4">
      <SectionTitle kanji="飾" title={isOwner ? t("title") : t("titlePublic")} />

      {main ? (
        <article className="flex flex-col gap-3">
          {main.count > 0 || isOwner ? (
            <>
              <ShowcaseView
                name={main.name}
                layout={main.layout}
                theme={main.theme}
                cards={mainCards}
                owned={owned}
                linkBase={linkBase}
                isOwner={isOwner}
                preload
              />
              <MainPlate showcase={main} href={href(main.id)} isOwner={isOwner} />
            </>
          ) : (
            <>
              <MainPlate showcase={main} href={href(main.id)} isOwner={isOwner} />
              <p className="lacquer rounded-card p-4 text-sm text-text-muted">{t("emptyPublic")}</p>
            </>
          )}
        </article>
      ) : isOwner ? (
        <div className="lacquer flex flex-col items-start gap-3 rounded-card p-4">
          <p className="text-sm text-text-muted">{t("emptyOwnerAll")}</p>
          {create}
        </div>
      ) : (
        <p className="lacquer rounded-card p-4 text-sm text-text-muted">{t("emptyPublicAll")}</p>
      )}

      {isOwner && others.length > 0 && (
        <div className="flex flex-col gap-2">
          <div>
            <h3 className="text-sm font-bold">{t("others")}</h3>
            <p className="text-xs text-text-muted">{t("privateHint")}</p>
          </div>
          {/* scroll-px-4 : l'accroche du défilement s'aligne sur la marge de la page, pas sur le bord de l'écran */}
          <ul className="-mx-4 flex snap-x scroll-px-4 gap-2.5 overflow-x-auto px-4 pb-2 lg:mx-0 lg:scroll-px-0 lg:px-0">
            {others.map((s) => {
              const still = SHOWCASE_THEMES[s.theme].media?.mobile.still;
              return (
                <li key={s.id} className="vt-shelf-item flex w-40 shrink-0 snap-start flex-col gap-2 rounded-card p-2.5" data-vt-tone={s.theme} data-media={still ? "" : undefined}>
                  {still && (
                    // eslint-disable-next-line @next/next/no-img-element -- fichier public déjà dimensionné, sans optimisation
                    <img src={still} alt="" loading="lazy" decoding="async" draggable={false} className="vt-shelf-media" />
                  )}
                  <Link href={href(s.id)} prefetch={false} className="flex min-h-18 flex-1 flex-col items-start justify-between gap-2">
                    <span aria-hidden="true" lang="ja" className="vt-seal">
                      {SHOWCASE_THEMES[s.theme].kanji}
                    </span>
                    <span className="max-w-full min-w-0">
                      <span className="block truncate text-sm font-bold">{s.name}</span>
                      <span className="vt-shelf-meta block truncate text-xs">{t("meta", { count: s.count, layout: t(`layouts.${s.layout}.name`) })}</span>
                    </span>
                  </Link>
                  <MakeMainButton id={s.id} showcaseIds={ids} short />
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {isOwner && main && create}
    </section>
  );
}
