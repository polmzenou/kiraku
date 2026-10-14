import { useFormatter, useLocale, useTranslations } from "next-intl";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { localize, type BoosterTypeView } from "@/lib/boosters/types";
import type { CardView } from "@/lib/boosters/view";
import { RARITY_SEAL } from "@/lib/catalog/rarity";

export type BannerSlide = {
  type: BoosterTypeView;
  /** Vedettes à montrer (illustrations), la plus rare d'abord. */
  featured: CardView[];
  /** Boosters avant la vedette garantie pour ce joueur (0 = pas de pitié vedette). */
  pityLeft: number;
  /** Heure du serveur, pour « se termine dans ». */
  now: number;
};

/**
 * Bannières vedettes en tête de page : carrousel horizontal (scroll-snap, aucun script), la vedette
 * en grand sur le fond aux couleurs de la bannière, la fin et la pitié vedette du joueur.
 */
export function BannerHero({ slides }: { slides: BannerSlide[] }) {
  const t = useTranslations("boosters.banners");
  const locale = useLocale();
  const format = useFormatter();
  if (slides.length === 0) return null;

  return (
    <section aria-label={t("label")} className="-mx-4 sm:mx-0">
      <ul className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:px-0">
        {slides.map(({ type, featured, pityLeft, now }) => {
          const hero = featured[0];
          const days = type.endsAt ? Math.max(1, Math.ceil((type.endsAt.getTime() - now) / 86_400_000)) : null;
          return (
            <li key={type.slug} className="w-[min(100%,34rem)] shrink-0 snap-start">
              <Link
                href={`/?b=${type.slug}&f=${type.family}`}
                scroll={false}
                className="booster-art relative flex min-h-44 overflow-hidden rounded-xl border border-border shadow-paper"
                data-ink={type.theme.ink}
                style={{ ["--booster-base" as string]: type.theme.base, ["--booster-dark" as string]: type.theme.dark }}
              >
                <span aria-hidden="true" className={`booster-foil wagara-${type.theme.pattern} absolute inset-0`} />
                <div className="relative z-10 flex min-w-0 flex-1 flex-col justify-between gap-3 p-4">
                  <div className="flex flex-col gap-1">
                    <span className="flex items-center gap-1.5 text-xs font-bold text-[var(--ink-2)]">
                      <span aria-hidden="true" lang="ja" className="font-seal text-kin">
                        星
                      </span>
                      {t("kicker")}
                    </span>
                    <span className="font-title text-2xl leading-tight font-extrabold text-[var(--ink)] [text-shadow:var(--ink-shadow)]">
                      {localize(type.name, locale)}
                    </span>
                    <span className="text-sm text-[var(--ink-2)]">{localize(type.tagline, locale)}</span>
                  </div>
                  <div className="flex flex-col gap-0.5 text-xs text-[var(--ink-2)]">
                    {days !== null && <span>{t("endsIn", { time: t("days", { count: days }) })}</span>}
                    {pityLeft > 0 && <span className="font-bold text-[var(--ink)]">{t("pity", { count: pityLeft })}</span>}
                    <span className="mt-1 font-bold text-[var(--ink)] underline underline-offset-4">{t("see")}</span>
                  </div>
                </div>
                {hero && (
                  <div className="relative z-10 w-[38%] max-w-44 shrink-0 self-stretch">
                    <Image
                      src={hero.imageUrl}
                      alt={hero.name}
                      fill
                      sizes="176px"
                      className="object-cover object-top [mask-image:linear-gradient(90deg,transparent,#000_30%)]"
                    />
                    <span
                      aria-hidden="true"
                      lang="ja"
                      className="absolute right-2 bottom-2 flex size-8 items-center justify-center rounded-[4px] bg-shu-btn font-seal text-lg text-washi-paper shadow-paper"
                    >
                      {RARITY_SEAL[hero.rarity]}
                    </span>
                    <span className="sr-only">{format.list(featured.map((c) => c.name))}</span>
                  </div>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
