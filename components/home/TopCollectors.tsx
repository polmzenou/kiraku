import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { Collector } from "@/server/collection/leaderboard";
import { displayName } from "../profile/ProfileHeader";
import { SectionTitle } from "../SectionTitle";
import { PlayerAvatar } from "../social/PlayerAvatar";
import { PlayerName } from "../social/PlayerName";
import { PlayerRow } from "../social/PlayerRow";

// Podium 2-1-3 : or (金), argent (銀), bronze (銅). Hauteurs de socle décroissantes.
const PLACES = {
  1: { kanji: "金", ring: "ring-kin", text: "text-kin", plinth: "h-28 border-kin/50 from-kin/25", avatar: 80 },
  2: {
    kanji: "銀",
    ring: "ring-text-muted",
    text: "text-text-muted",
    plinth: "h-20 border-text-muted/40 from-text-muted/20",
    avatar: 64,
  },
  3: { kanji: "銅", ring: "ring-shu", text: "text-shu", plinth: "h-16 border-shu/40 from-shu/20", avatar: 64 },
} as const;

/** Section « Top collectionneurs » de l'accueil : podium des trois premiers et lien vers /classement. */
export function TopCollectors({ collectors, withHeader = true }: { collectors: Collector[]; withHeader?: boolean }) {
  const t = useTranslations("home.collectors");
  if (collectors.length === 0) return null;
  // Ordre visuel 2-1-3 ; l'ordre de lecture (lecteur d'écran) reste 1-2-3 grâce à `order`
  const podium = collectors.slice(0, 3);

  return (
    <section
      aria-labelledby={withHeader ? "top-collectionneurs" : undefined}
      aria-label={withHeader ? undefined : t("title")}
      className="flex flex-col gap-6"
    >
      {withHeader && (
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <SectionTitle id="top-collectionneurs" kanji="番付" title={t("title")} subtitle={t("subtitle")} />
          <Link
            href="/classement"
            className="inline-flex min-h-11 items-center text-sm font-bold text-shu underline-offset-4 hover:underline"
          >
            {t("full")}
          </Link>
        </div>
      )}
      <ol className="mx-auto grid w-full max-w-2xl grid-cols-3 items-end gap-2 sm:gap-4">
        {podium.map((c) => (
          <Place key={c.username} collector={c} />
        ))}
      </ol>
    </section>
  );
}

/** Ligne d'un collectionneur sous le podium (/classement, page Social) : joueur, cartes, Mythiques et place. */
export function CollectorRow({ collector }: { collector: Collector }) {
  const t = useTranslations("home.collectors");
  return (
    <PlayerRow
      player={collector}
      detail={`${t("cards", { count: collector.uniqueCards })} · ${t("mythics", { count: collector.mythics })}`}
    >
      <span className="w-10 text-right font-title text-lg font-extrabold text-text-muted tabular-nums">
        <span className="sr-only">{t("rank", { rank: collector.rank })}</span>
        <span aria-hidden="true">{collector.rank}</span>
      </span>
    </PlayerRow>
  );
}

function Place({ collector }: { collector: Collector }) {
  const t = useTranslations("home.collectors");
  const tAccount = useTranslations("account");
  const place = PLACES[collector.rank as 1 | 2 | 3];
  const name = displayName(collector.username, collector.isGuest, (code) => tAccount("guestName", { code }));
  const order = collector.rank === 1 ? "order-2" : collector.rank === 2 ? "order-1" : "order-3";

  return (
    <li className={`flex min-w-0 flex-col items-center gap-2 ${order}`}>
      <Link
        href={`/u/${collector.username}`}
        className="group flex min-w-0 max-w-full flex-col items-center gap-1.5 rounded-card px-1 pt-1"
      >
        <span className="relative">
          <PlayerAvatar
            username={collector.username}
            image={collector.image}
            size={place.avatar}
            frame={collector.decor.frame}
            // Le cadre porté remplace l'anneau de la place
            className={collector.decor.frame ? "" : `ring-[3px] ring-offset-2 ring-offset-bg ${place.ring}`}
          />
          <span
            aria-hidden="true"
            lang="ja"
            className={`absolute -bottom-1.5 left-1/2 flex size-6 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-surface font-seal text-xs ${place.text}`}
          >
            {place.kanji}
          </span>
        </span>
        <PlayerName name={name} color={collector.decor.nameColor} className="mt-1 max-w-full truncate text-sm font-bold group-hover:underline sm:text-base" />
      </Link>
      <p className="text-center text-xs text-text-muted tabular-nums">
        {t("cards", { count: collector.uniqueCards })}
        <span aria-hidden="true"> · </span>
        <span className="sr-only">, </span>
        <span aria-hidden="true" lang="ja" className="font-seal text-rarity-mythic">
          神
        </span>{" "}
        {t("mythics", { count: collector.mythics })}
      </p>
      <div
        className={`flex w-full items-center justify-center rounded-t-xl border border-b-0 bg-linear-to-b to-transparent ${place.plinth}`}
      >
        <span className={`font-title text-3xl font-extrabold tabular-nums ${place.text}`}>
          <span className="sr-only">{t("rank", { rank: collector.rank })}</span>
          <span aria-hidden="true">{collector.rank}</span>
        </span>
      </div>
    </li>
  );
}
