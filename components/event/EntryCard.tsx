import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { EntryResult, ShowcaseEntryView } from "@/lib/event/view";
import { PlayerAvatar } from "../social/PlayerAvatar";
import { playerTag } from "../social/PlayerName";
import { EntryStage } from "./EntryStage";

/**
 * Une vitrine de l'event : « Vitrine de [pseudo] » au-dessus, la vitrine figée, puis l'action (vote) en
 * dessous. Après la clôture, sa place et ses votes.
 */
export function EntryCard({ entry, result, action }: { entry: ShowcaseEntryView; result?: EntryResult; action?: ReactNode }) {
  const t = useTranslations("event.entry");
  const headingId = `vitrine-${entry.id}`;
  const name = entry.player.username;
  return (
    <article id={headingId} aria-labelledby={`${headingId}-titre`} className="flex scroll-mt-20 flex-col gap-3">
      <header className="flex min-w-0 items-center gap-3">
        <PlayerAvatar username={name} image={entry.player.image} size={40} frame={entry.player.decor.frame} />
        <div className="flex min-w-0 flex-1 flex-col">
          <h3 id={`${headingId}-titre`} className="truncate font-title text-lg font-bold">
            {t.rich("of", { name, player: playerTag(entry.player.decor.nameColor) })}
          </h3>
          {entry.name && <p className="truncate text-xs text-text-muted">{entry.name}</p>}
        </div>
        {result && (
          <p className="shrink-0 text-right text-sm font-bold tabular-nums">
            <span className={result.rank <= 3 ? "text-kin" : "text-text-muted"}>{t("rank", { rank: result.rank })}</span>
            <span aria-hidden="true"> · </span>
            <span className="sr-only">, </span>
            <span className="text-text-muted">{t("votes", { count: result.votes })}</span>
          </p>
        )}
      </header>
      <EntryStage entry={entry} label={t("label", { name })} />
      {action}
    </article>
  );
}
