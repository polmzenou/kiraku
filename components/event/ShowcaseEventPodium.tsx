import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { PodiumEntry } from "@/lib/event/view";
import { PlayerAvatar } from "../social/PlayerAvatar";
import { PlayerName } from "../social/PlayerName";

// Podium 2-1-3 de l'event vitrines, comme celui des collectionneurs : or (金), argent (銀), bronze (銅).
const PLACES = {
  1: { kanji: "金", ring: "ring-kin", text: "text-kin", plinth: "h-28 border-kin/50 from-kin/25", avatar: 80 },
  2: { kanji: "銀", ring: "ring-text-muted", text: "text-text-muted", plinth: "h-20 border-text-muted/40 from-text-muted/20", avatar: 64 },
  3: { kanji: "銅", ring: "ring-shu", text: "text-shu", plinth: "h-16 border-shu/40 from-shu/20", avatar: 64 },
} as const;

/** Les trois vitrines les plus votées ; chaque place mène à la vitrine sur /event. */
export function ShowcaseEventPodium({ podium, label }: { podium: readonly PodiumEntry[]; label: string }) {
  if (podium.length === 0) return null;
  return (
    <ol aria-label={label} className="mx-auto grid w-full max-w-2xl grid-cols-3 items-end gap-2 sm:gap-4">
      {podium.map((entry) => (
        <Place key={entry.entryId} entry={entry} />
      ))}
    </ol>
  );
}

function Place({ entry }: { entry: PodiumEntry }) {
  const t = useTranslations("event.entry");
  const place = PLACES[entry.rank as 1 | 2 | 3];
  // Ordre visuel 2-1-3 ; l'ordre de lecture reste 1-2-3
  const order = entry.rank === 1 ? "order-2" : entry.rank === 2 ? "order-1" : "order-3";
  return (
    <li className={`flex min-w-0 flex-col items-center gap-2 ${order}`}>
      <Link
        href={`/event#vitrine-${entry.entryId}`}
        prefetch={false}
        aria-label={t("label", { name: entry.player.username })}
        className="group flex min-w-0 max-w-full flex-col items-center gap-1.5 rounded-card px-1 pt-1"
      >
        <span className="relative">
          <PlayerAvatar
            username={entry.player.username}
            image={entry.player.image}
            size={place.avatar}
            frame={entry.player.decor.frame}
            className={entry.player.decor.frame ? "" : `ring-[3px] ring-offset-2 ring-offset-bg ${place.ring}`}
          />
          <span
            aria-hidden="true"
            lang="ja"
            className={`absolute -bottom-1.5 left-1/2 flex size-6 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-surface font-seal text-xs ${place.text}`}
          >
            {place.kanji}
          </span>
        </span>
        <PlayerName name={entry.player.username} color={entry.player.decor.nameColor} className="mt-1 max-w-full truncate text-sm font-bold group-hover:underline sm:text-base" />
      </Link>
      <p className="text-center text-xs text-text-muted tabular-nums">{t("votes", { count: entry.votes })}</p>
      <div className={`flex w-full items-center justify-center rounded-t-xl border border-b-0 bg-linear-to-b to-transparent ${place.plinth}`}>
        <span className={`font-title text-3xl font-extrabold tabular-nums ${place.text}`}>
          <span className="sr-only">{t("rank", { rank: entry.rank })}</span>
          <span aria-hidden="true">{entry.rank}</span>
        </span>
      </div>
    </li>
  );
}
