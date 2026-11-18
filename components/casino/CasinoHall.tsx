import Image from "next/image";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { CASINO_MEDIA } from "@/lib/casino/media";
import type { FeedEntry } from "@/server/casino/queries";
import { SectionTitle } from "../SectionTitle";
import { CoinFlipFeed } from "./CoinFlipFeed";

/**
 * Hall du casino : la carte peinte du pile ou face (tables ouvertes, lancers du jour), les jeux à venir
 * encore scellés, et le fil des derniers lancers.
 */
export async function CasinoHall({
  pulse,
  feed,
  feedRefreshSeconds,
  serverNow,
  isNew,
  gauge,
}: {
  pulse: { openTables: number; flipsToday: number };
  feed: FeedEntry[];
  feedRefreshSeconds: number;
  serverNow: number;
  /** Pendant les jours qui suivent l'ouverture : étiquette « Nouveau » sur le jeu. */
  isNew: boolean;
  /** Jauge communautaire des lancers (inauguration), si elle est allumée. */
  gauge?: ReactNode;
}) {
  const t = await getTranslations("casino");
  return (
    <div className="flex flex-col gap-6">
      <SectionTitle level={1} kanji="賭" title={t("title")} />

      <section aria-label={t("hall.label")} className="flex flex-col gap-4">
        <Link
          href="/casino/pile-ou-face"
          className="group relative isolate flex min-h-44 overflow-hidden rounded-hero border border-border bg-[#15120F] outline-offset-2 md:min-h-72"
        >
          <Image
            src={CASINO_MEDIA.hero}
            alt=""
            fill
            priority
            sizes="(min-width: 1200px) 1200px, 100vw"
            className="-z-10 object-cover object-[80%_50%] transition-transform duration-500 group-hover:scale-[1.02] motion-reduce:transition-none"
          />
          <span aria-hidden="true" className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgb(13_14_23/0.92),rgb(13_14_23/0.35)_65%,transparent)]" />
          <span className="flex w-56 flex-col gap-1 p-4 md:w-80 md:p-8">
            {isNew && <span className="self-start rounded-pill bg-kin/20 px-2 text-xs font-bold text-kin ring-1 ring-kin/50 ring-inset">{t("hall.coinflip.tag")}</span>}
            <span className="font-title text-2xl font-extrabold md:text-4xl">{t("hall.coinflip.title")}</span>
            <span className="text-sm text-text/80">{t("hall.coinflip.body")}</span>
            <span className="mt-auto pt-3 text-xs text-text-muted tabular-nums">
              {t("hall.coinflip.stats", { open: pulse.openTables, today: pulse.flipsToday })}
            </span>
            <span className="mt-2 inline-flex min-h-11 items-center self-start rounded-control bg-shu-btn px-5 text-sm font-bold text-washi-paper shadow-raised">
              {t("hall.coinflip.play")}
            </span>
          </span>
        </Link>

        <div className="flex flex-col gap-2">
          <SectionTitle title={t("hall.upcoming")} />
          <ul className="grid grid-cols-2 gap-3">
            {[t("hall.sealedNext"), t("hall.sealedLater")].map((when) => (
              <li key={when} className="flex items-center gap-2 rounded-card border border-border bg-[#15120F] py-1.5 pr-3 pl-1">
                <Image src={CASINO_MEDIA.sealed} alt="" width={76} height={76} className="size-16 shrink-0 md:size-20" />
                <span className="flex min-w-0 flex-col">
                  <b className="text-sm">{t("hall.sealed")}</b>
                  <small className="text-xs text-text-muted">{when}</small>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {gauge}

      <section className="flex flex-col gap-3">
        <SectionTitle title={t("hall.feedTitle")} />
        <CoinFlipFeed initial={feed} refreshSeconds={feedRefreshSeconds} serverNow={serverNow} />
      </section>

      <p className="text-center text-xs text-text-muted">{t("virtual")}</p>
    </div>
  );
}
