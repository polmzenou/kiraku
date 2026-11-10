import { getFormatter, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { HomeShowcaseEvent as HomeEvent } from "@/server/home/showcase-event";
import { getSetting } from "@/server/settings";
import { ShowcaseEventPodium } from "../event/ShowcaseEventPodium";
import { SectionTitle } from "../SectionTitle";
import { ButtonLink } from "../ui/ButtonLink";

/**
 * Event vitrines dans la section des classements de l'accueil : invitation pendant l'event (inscription et
 * votes), puis podium des trois vitrines les plus votées après la clôture.
 */
export async function HomeShowcaseEvent({ event }: { event: HomeEvent }) {
  const [t, format, timeZone] = await Promise.all([getTranslations("home.showcaseEvent"), getFormatter(), getSetting("game.timeZone")]);
  const date = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "long", timeStyle: "short", timeZone });

  if (event.phase !== "ended") {
    return (
      <section aria-labelledby="event-vitrines" className="flex flex-col gap-4">
        <SectionTitle id="event-vitrines" kanji="催事" title={t("title")} subtitle={t(`subtitle.${event.phase}`)} />
        <div className="flex flex-col items-start gap-3 lacquer rounded-card p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">{event.phase === "live" ? t("live", { end: date(event.endsAt) }) : t("upcoming", { start: date(event.startsAt) })}</p>
          <ButtonLink href="/event" variant="primary" prefetch={false}>
            {t(event.phase === "live" ? "join" : "discover")}
          </ButtonLink>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="event-vitrines" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <SectionTitle id="event-vitrines" kanji="飾" title={t("podiumTitle")} subtitle={t("subtitle.ended", { end: date(event.endsAt) })} />
        <Link href="/event" prefetch={false} className="inline-flex min-h-11 items-center text-sm font-bold text-shu underline-offset-4 hover:underline">
          {t("all")}
        </Link>
      </div>
      <ShowcaseEventPodium podium={event.podium} label={t("podiumTitle")} />
    </section>
  );
}
