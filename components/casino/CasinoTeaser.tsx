import { getFormatter, getTranslations } from "next-intl/server";
import { CASINO_MEDIA } from "@/lib/casino/media";
import { ButtonLink } from "../ui/ButtonLink";
import { CasinoRules } from "./CasinoRules";
import { LoopBackdrop } from "./LoopBackdrop";
import { OpeningCountdown } from "./OpeningCountdown";

/**
 * Teaser avant l'ouverture : la façade de nuit, portes fermées, l'ombre de la pièce derrière le shōji ;
 * la date et le compte à rebours si l'ouverture est réglée, les règles en trois lignes.
 */
export async function CasinoTeaser({ opensAt, serverNow }: { opensAt: number | null; serverNow: number }) {
  const [t, format] = await Promise.all([getTranslations("casino"), getFormatter()]);
  return (
    <div className="flex flex-col gap-5">
      <section className="relative isolate -mx-4 -mt-4 flex min-h-[min(calc(100dvh-7rem),46rem)] flex-col justify-end overflow-hidden bg-[#0D0E17] md:mx-0 md:mt-0 md:min-h-[34rem] md:rounded-hero">
        <LoopBackdrop mobile={CASINO_MEDIA.facade.closed.mobile} desktop={CASINO_MEDIA.facade.closed.desktop} priority />
        <span
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgb(13_14_23/0.55),transparent_14%,transparent_58%,rgb(21_18_15/0.88)_78%,var(--color-bg))] md:bg-[linear-gradient(90deg,rgb(13_14_23/0.92),rgb(13_14_23/0.55)_42%,transparent_70%)]"
        />
        <div className="flex flex-col gap-3 p-5 md:max-w-md md:p-10">
          <p className="text-xs font-bold tracking-[0.14em] text-kin uppercase">
            {opensAt !== null
              ? t("teaser.kicker", { date: format.dateTime(new Date(opensAt), { dateStyle: "long", timeStyle: "short" }) })
              : t("teaser.kickerNoDate")}
          </p>
          <h1 className="font-heading text-3xl leading-tight font-normal text-balance md:text-4xl">{t("teaser.title")}</h1>
          <p className="text-sm text-text/80">{t("teaser.body")}</p>
          {opensAt !== null && <OpeningCountdown opensAt={opensAt} serverNow={serverNow} />}
        </div>
      </section>
      <div className="flex flex-col gap-4 md:max-w-xl">
        <CasinoRules />
        <p className="text-xs text-text-muted">{t("virtual")}</p>
        <ButtonLink href="/" className="self-start">
          {t("back")}
        </ButtonLink>
      </div>
    </div>
  );
}
