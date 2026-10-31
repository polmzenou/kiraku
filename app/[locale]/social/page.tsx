import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DiscordPromo } from "@/components/discord/DiscordPromo";
import { GuestBootstrap } from "@/components/GuestBootstrap";
import { CollectorRow, TopCollectors } from "@/components/home/TopCollectors";
import { PageShell } from "@/components/PageShell";
import { SectionTitle } from "@/components/SectionTitle";
import { PlayerRow } from "@/components/social/PlayerRow";
import { SearchResultActions } from "@/components/social/SearchResultActions";
import { buttonClasses } from "@/components/ui/Button";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { inputClass } from "@/components/ui/Field";
import { isFrozen } from "@/lib/account/deletion";
import { parsePlayerQuery, PLAYER_QUERY_MAX, PLAYER_QUERY_MIN } from "@/lib/social/search";
import { tradeOfferable } from "@/lib/social/trades";
import { getTopCollectors } from "@/server/collection/leaderboard";
import { clientIp, rateLimit } from "@/server/ratelimit";
import { getSetting } from "@/server/settings";
import { searchPlayers } from "@/server/social/search";
import { getCurrentUser } from "@/server/user";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("socialPage");
  return { title: t("title"), robots: { index: false, follow: true } };
}

/** Collectionneurs affichés sur la page (podium, puis la suite en liste) ; le classement complet est sur /classement. */
const TOP_SIZE = 10;

type Viewer = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/**
 * Page Social : chercher un joueur et l'ajouter ou lui proposer un échange sans passer par son
 * profil, top collectionneurs, et la section Discord quand l'admin l'affiche.
 */
export default async function SocialPage({ searchParams }: PageProps<"/[locale]/social">) {
  const [t, user, sp] = await Promise.all([getTranslations("socialPage"), getCurrentUser(), searchParams]);
  if (!user) {
    return (
      <PageShell>
        <GuestBootstrap />
      </PageShell>
    );
  }
  const rawQ = Array.isArray(sp.q) ? sp.q[0] : sp.q;

  return (
    <PageShell>
      <SectionTitle level={1} kanji="縁" title={t("title")} subtitle={t("subtitle")} />
      <div className="grid gap-10 lg:grid-cols-2 lg:items-start">
        <div className="flex min-w-0 flex-col gap-8">
          <PlayerSearch viewer={user} rawQ={rawQ} />
          <DiscordPromo member={!user.isGuest} />
        </div>
        <Collectors raw={user.role === "DEV"} />
      </div>
    </PageShell>
  );
}

async function PlayerSearch({ viewer, rawQ }: { viewer: Viewer; rawQ: string | undefined }) {
  const t = await getTranslations("socialPage.search");
  const title = <SectionTitle kanji="探" title={t("title")} subtitle={t("subtitle")} />;

  // Invités exclus du social, comme les demandes d'amis et les échanges
  if (viewer.isGuest) {
    return (
      <section className="flex flex-col gap-3">
        {title}
        <div className="flex flex-col items-start gap-3 lacquer rounded-card p-4">
          <p className="text-sm">{t("guestOnly")}</p>
          <ButtonLink href="/inscription" variant="primary">
            {t("signUp")}
          </ButtonLink>
        </div>
      </section>
    );
  }
  if (viewer.bannedAt || isFrozen(viewer) || !(await getSetting("social.enabled"))) {
    return (
      <section className="flex flex-col gap-3">
        {title}
        <p className="lacquer rounded-card p-4 text-sm text-text-muted">{t("disabled")}</p>
      </section>
    );
  }

  const query = parsePlayerQuery(rawQ);
  return (
    <section className="flex flex-col gap-3">
      {title}
      <form action="" className="flex gap-2" role="search">
        <label htmlFor="social-q" className="sr-only">
          {t("label")}
        </label>
        <input
          id="social-q"
          type="search"
          name="q"
          defaultValue={rawQ?.slice(0, PLAYER_QUERY_MAX) ?? ""}
          maxLength={PLAYER_QUERY_MAX}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder={t("placeholder")}
          className={`${inputClass} min-w-0 flex-1`}
        />
        <button type="submit" className={buttonClasses("primary")}>
          {t("submit")}
        </button>
      </form>
      {query.ok ? (
        <SearchResults viewerId={viewer.id} q={query.q} />
      ) : (
        <p className="text-xs text-text-muted">
          {query.reason === "EMPTY" ? t("hint", { min: PLAYER_QUERY_MIN }) : query.reason === "SHORT" ? t("short", { min: PLAYER_QUERY_MIN }) : t("invalid")}
        </p>
      )}
    </section>
  );
}

async function SearchResults({ viewerId, q }: { viewerId: string; q: string }) {
  const t = await getTranslations("socialPage.search");
  const [limit, perMinute, perMinuteIp, tradesEnabled, nonFriends, maxOffered, allowedRarities] = await Promise.all([
    getSetting("social.searchLimit"),
    getSetting("social.searchPerMinute"),
    getSetting("social.searchPerMinuteIp"),
    getSetting("trades.enabled"),
    getSetting("trades.nonFriends"),
    getSetting("trades.maxOffered"),
    getSetting("trades.allowedRarities"),
  ]);
  // Par joueur puis par appareil : on ne balaie pas les pseudos en changeant de compte
  const allowed =
    (await rateLimit(`social-search:${viewerId}`, { limit: perMinute, windowSeconds: 60 })).success &&
    (await rateLimit(`social-search-ip:${await clientIp()}`, { limit: perMinuteIp, windowSeconds: 60 })).success;
  if (!allowed) {
    return (
      <p role="alert" className="text-sm text-shu">
        {t("rateLimited")}
      </p>
    );
  }

  const hits = await searchPlayers(viewerId, q, limit);
  if (hits.length === 0) return <p className="lacquer rounded-card p-4 text-sm text-text-muted">{t("noResult", { q })}</p>;
  const trade = { maxOffered, allowedRarities };

  return (
    <>
      <p className="sr-only" role="status">
        {t("count", { count: hits.length })}
      </p>
      <ul className="lacquer rounded-card px-3">
        {hits.map((p) => (
          <PlayerRow
            key={p.username}
            player={{ username: p.username, image: p.image, isGuest: false, decor: p.decor }}
            detail={p.profile ? undefined : t("hiddenProfile")}
          >
            <SearchResultActions
              username={p.username}
              initial={p.relation}
              trade={tradesEnabled && tradeOfferable(p.relation, p.collection, nonFriends) ? trade : null}
            />
          </PlayerRow>
        ))}
      </ul>
    </>
  );
}

async function Collectors({ raw }: { raw: boolean }) {
  const t = await getTranslations("socialPage");
  const collectors = await getTopCollectors(TOP_SIZE, { raw });
  if (collectors.length === 0) {
    return <p className="lacquer rounded-card p-4 text-sm text-text-muted">{t("collectorsEmpty")}</p>;
  }
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <TopCollectors collectors={collectors.slice(0, 3)} />
      {collectors.length > 3 && (
        <ol className="flex flex-col lacquer rounded-card px-4">
          {collectors.slice(3).map((c) => (
            <CollectorRow key={c.username} collector={c} />
          ))}
        </ol>
      )}
    </div>
  );
}
