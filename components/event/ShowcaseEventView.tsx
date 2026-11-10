import { getFormatter, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { pageOf, seededOrder } from "@/lib/event/showcase";
import type { EntryResult, ShowcaseEventState } from "@/lib/event/view";
import { getEntries, getMyEntry, getMyVote, getShowcaseEventPodium, getShowcaseEventResults, listEntryIds } from "@/server/event/showcase-queries";
import { getSetting } from "@/server/settings";
import { listShowcases } from "@/server/showcase/queries";
import { SectionTitle } from "../SectionTitle";
import { ButtonLink } from "../ui/ButtonLink";
import { EntryCard } from "./EntryCard";
import { EntryPicker, WithdrawButton } from "./EntryPicker";
import { ShowcaseEventPodium } from "./ShowcaseEventPodium";
import { VoteButton, VoteProvider } from "./VoteProvider";

/** Visiteur de /event : `canPlay` = compte inscrit, actif (ni banni ni gelé). */
export type EventViewer = { id: string; username: string; isGuest: boolean; canPlay: boolean } | null;

/**
 * Event vitrines : règles et dates ; pendant l'event, sa participation et la galerie mélangée avec les
 * votes (sans compteur) ; après la clôture, le podium et toutes les vitrines par rang.
 */
export async function ShowcaseEventView({ state, viewer, page, locale }: { state: ShowcaseEventState; viewer: EventViewer; page: number; locale: string }) {
  const [t, format, timeZone] = await Promise.all([getTranslations("event"), getFormatter(), getSetting("game.timeZone")]);
  const date = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "long", timeStyle: "short", timeZone });

  const header = (
    <div className="flex flex-col gap-4">
      <SectionTitle level={1} kanji="催事" title={t("title")} subtitle={t("subtitle")} />
      <p role="status" className="text-sm font-bold">
        {state.phase ? t(`status.${state.phase}`, { start: date(state.startsAt), end: date(state.endsAt) }) : t("noDates")}
      </p>
      <section aria-labelledby="regles" className="lacquer rounded-card p-4">
        <h2 id="regles" className="mb-2 font-title text-lg font-bold">
          {t("rules.title")}
        </h2>
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-text-muted">
          <li>{t("rules.entry")}</li>
          <li>{t("rules.vote")}</li>
          <li>{t("rules.results")}</li>
        </ul>
      </section>
    </div>
  );

  if (state.phase === "live") {
    return (
      <>
        {header}
        <Participation state={state} viewer={viewer} locale={locale} />
        <Gallery state={state} viewer={viewer} page={page} locale={locale} />
      </>
    );
  }
  if (state.phase === "ended") {
    return (
      <>
        {header}
        <Results state={state} page={page} locale={locale} />
      </>
    );
  }
  return header;
}

async function Participation({ state, viewer, locale }: { state: ShowcaseEventState; viewer: EventViewer; locale: string }) {
  const t = await getTranslations("event.participation");
  const title = (
    <h2 id="participation" className="font-title text-xl font-bold">
      {t("title")}
    </h2>
  );
  if (!viewer || viewer.isGuest) {
    return (
      <aside aria-labelledby="participation" className="flex flex-col items-start gap-3 lacquer rounded-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          {title}
          <p className="text-sm">{t("guest")}</p>
        </div>
        <ButtonLink href="/inscription" variant="primary">
          {t("signUp")}
        </ButtonLink>
      </aside>
    );
  }
  if (!viewer.canPlay) {
    return (
      <section aria-labelledby="participation" className="flex flex-col gap-2 lacquer rounded-card p-4">
        {title}
        <p className="text-sm text-text-muted">{t("unavailable")}</p>
      </section>
    );
  }
  const mine = await getMyEntry(state.edition, viewer.id, locale);
  if (mine) {
    return (
      <section aria-labelledby="participation" className="flex flex-col gap-4 lacquer rounded-card p-4">
        {title}
        <p className="text-sm text-text-muted">{t("entered")}</p>
        <EntryCard entry={mine} action={<WithdrawButton />} />
      </section>
    );
  }
  const showcases = await listShowcases(viewer.id);
  return (
    <section aria-labelledby="participation" className="flex flex-col gap-4 lacquer rounded-card p-4">
      {title}
      <EntryPicker
        showcases={showcases.map((s) => ({ id: s.id, name: s.name, order: s.sortOrder, layout: s.layout, count: s.count }))}
        minCards={state.minCards}
        profileHref={`/u/${viewer.username}`}
      />
    </section>
  );
}

async function Gallery({ state, viewer, page, locale }: { state: ShowcaseEventState; viewer: EventViewer; page: number; locale: string }) {
  const t = await getTranslations("event");
  const ids = await listEntryIds(state.edition);
  // Ordre mélangé propre à chaque joueur : personne n'est avantagé par sa date d'inscription
  const order = seededOrder(ids, `${viewer?.id ?? "visiteur"}:${state.edition}`);
  const current = pageOf(order, page, state.pageSize);
  const [entries, myVote] = await Promise.all([
    getEntries(current.items, locale),
    viewer?.canPlay ? getMyVote(state.edition, viewer.id) : null,
  ]);
  const canVote = viewer?.canPlay === true;
  return (
    <section aria-labelledby="galerie" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="galerie" className="font-heading text-xl font-extrabold">
          {t("gallery.title")}
        </h2>
        <p className="text-sm text-text-muted tabular-nums">{t("gallery.count", { count: ids.length })}</p>
      </div>
      {entries.length === 0 ? (
        <p className="lacquer rounded-card p-6 text-center text-text-muted">{t("gallery.empty")}</p>
      ) : (
        <VoteProvider initial={myVote}>
          <ul className="mx-auto flex w-full max-w-4xl flex-col gap-10">
            {entries.map((entry) => (
              <li key={entry.id}>
                <EntryCard
                  entry={entry}
                  action={
                    entry.player.id === viewer?.id ? (
                      <p className="text-sm font-bold text-text-muted">{t("entry.own")}</p>
                    ) : canVote ? (
                      <VoteButton entryId={entry.id} name={entry.player.username} />
                    ) : null
                  }
                />
              </li>
            ))}
          </ul>
        </VoteProvider>
      )}
      <Pagination page={current.page} pages={current.pages} />
    </section>
  );
}

async function Results({ state, page, locale }: { state: ShowcaseEventState; page: number; locale: string }) {
  const t = await getTranslations("event");
  const [results, podium] = await Promise.all([getShowcaseEventResults(state), getShowcaseEventPodium(state)]);
  const ranked = results ?? [];
  const current = pageOf(ranked, page, state.pageSize);
  const entries = await getEntries(current.items.map((r) => r.entryId), locale);
  const byEntry = new Map<string, EntryResult>(ranked.map((r) => [r.entryId, r]));
  return (
    <section aria-labelledby="resultats" className="flex flex-col gap-8">
      <h2 id="resultats" className="font-heading text-xl font-extrabold">
        {t("results.title")}
      </h2>
      {ranked.length === 0 ? (
        <p className="lacquer rounded-card p-6 text-center text-text-muted">{t("gallery.emptyEnded")}</p>
      ) : (
        <>
          {current.page === 1 && <ShowcaseEventPodium podium={podium} label={t("results.podium")} />}
          <ol className="mx-auto flex w-full max-w-4xl flex-col gap-10">
            {entries.map((entry) => (
              <li key={entry.id}>
                <EntryCard entry={entry} result={byEntry.get(entry.id)} />
              </li>
            ))}
          </ol>
        </>
      )}
      <Pagination page={current.page} pages={current.pages} />
    </section>
  );
}

async function Pagination({ page, pages }: { page: number; pages: number }) {
  if (pages <= 1) return null;
  const t = await getTranslations("event.pagination");
  const link = "inline-flex min-h-11 items-center rounded-pill px-4 text-sm font-bold lacquer";
  return (
    <nav aria-label={t("label")} className="flex items-center justify-between gap-3">
      {page > 1 ? (
        <Link href={{ pathname: "/event", query: { page: page - 1 } }} prefetch={false} className={link}>
          {t("previous")}
        </Link>
      ) : (
        <span />
      )}
      <p className="text-sm text-text-muted tabular-nums">{t("page", { page, pages })}</p>
      {page < pages ? (
        <Link href={{ pathname: "/event", query: { page: page + 1 } }} prefetch={false} className={link}>
          {t("next")}
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
