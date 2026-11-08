import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { displayName } from "@/components/profile/ProfileHeader";
import { ShareProfileButton } from "@/components/profile/ShareProfileButton";
import { profileSocialBar } from "@/components/profile/ProfileSocialBar";
import { CreateShowcaseButton } from "@/components/showcase/CreateShowcaseSheet";
import { ShowcaseEditor } from "@/components/showcase/ShowcaseEditor";
import { ShowcaseHeading } from "@/components/showcase/ShowcaseHeading";
import { ShowcaseTabs } from "@/components/showcase/ShowcaseTabs";
import { ShowcaseView } from "@/components/showcase/ShowcaseView";
import { VisitorShowcaseBar } from "@/components/showcase/VisitorShowcaseBar";
import { getPathname, Link, redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { isThemeId } from "@/lib/showcase/theme-registry";
import { effectiveTheme } from "@/lib/showcase/themes";
import { USERNAME_REGEX } from "@/lib/username";
import { anonymousAccess, findProfileOwner } from "@/server/collection/profile";
import { loadProfile } from "@/server/collection/profile-page";
import { ownedCardIds } from "@/server/collection/owned";
import { getSetting } from "@/server/settings";
import { getShowcaseCards, listShowcases } from "@/server/showcase/queries";

export async function generateMetadata({ params }: PageProps<"/[locale]/u/[username]/vitrines/[id]">): Promise<Metadata> {
  const { locale: raw, username: rawUsername, id } = await params;
  const locale = hasLocale(routing.locales, raw) ? raw : routing.defaultLocale;
  const username = decodeURIComponent(rawUsername);
  const owner = USERNAME_REGEX.test(username) ? await findProfileOwner(username) : null;
  if (!owner) return {};
  const showcases = await listShowcases(owner.id);
  const index = showcases.findIndex((s) => s.id === id);
  // Une vitrine privée (pas la principale) ne dévoile ni son nom ni son contenu
  if (index !== 0) return { robots: { index: false, follow: false } };
  const [t, tAccount] = await Promise.all([getTranslations({ locale, namespace: "showcase" }), getTranslations({ locale, namespace: "account" })]);
  const name = displayName(owner.username, owner.isGuest, (code) => tAccount("guestName", { code }));
  const showcaseName = showcases[index].name ?? t("untitled", { n: index + 1 });
  return {
    title: t("metaTitle", { name: showcaseName, owner: name }),
    description: t("metaDescription", { name: showcaseName, owner: name, count: showcases[index].count }),
    // Comme le profil : jamais indexée, liens suivis seulement s'il est public pour tous
    robots: { index: false, follow: !owner.isGuest && anonymousAccess(owner).profile },
    alternates: { canonical: getPathname({ href: `/u/${owner.username}/vitrines/${id}`, locale }) },
  };
}

export default async function ShowcasePage({ params, searchParams }: PageProps<"/[locale]/u/[username]/vitrines/[id]">) {
  const [{ username, id }, query] = await Promise.all([params, searchParams]);
  const locale = await getLocale();
  const { owner, viewer, access } = await loadProfile(username, locale, `/vitrines/${id}`);
  // Profil privé pour ce visiteur : la page du profil explique pourquoi
  if (!access.profile) redirect({ href: `/u/${owner.username}`, locale });

  const [showcases, setting, max] = await Promise.all([listShowcases(owner.id), getSetting("showcase.themes"), getSetting("showcase.maxPerPlayer")]);
  const index = showcases.findIndex((s) => s.id === id);
  // Seule la vitrine principale (la première) est publique ; les autres n'existent que pour leur propriétaire
  if (index < 0 || (index !== 0 && !access.isOwner)) notFound();
  const current = showcases[index];
  const [t, tAccount, cards] = await Promise.all([
    getTranslations("showcase"),
    getTranslations("account"),
    getShowcaseCards(current.id, owner.id, current.layout, locale),
  ]);
  const ownerName = displayName(owner.username, owner.isGuest, (code) => tAccount("guestName", { code }));
  const nameOf = (i: number) => showcases[i].name ?? t("untitled", { n: i + 1 });
  const theme = effectiveTheme(current.theme, setting);
  const tabs = showcases.map((s, i) => ({ id: s.id, name: nameOf(i), theme: effectiveTheme(s.theme, setting) }));
  const cardIds = cards.flatMap((c) => (c ? [c.cardId] : []));

  return (
    <PageShell>
      <div className="flex items-center gap-2">
        <Link
          href={`/u/${owner.username}`}
          aria-label={t("backToProfile", { name: ownerName })}
          className="-ml-2 inline-flex size-11 shrink-0 items-center justify-center rounded-control text-text"
        >
          <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </Link>
        <p className="min-w-0 truncate text-sm text-text-muted">{t("of", { name: ownerName })}</p>
      </div>

      {access.isOwner && (
        <ShowcaseTabs
          username={owner.username}
          ownerName={ownerName}
          tabs={tabs}
          currentId={current.id}
          extra={<CreateShowcaseButton username={owner.username} count={showcases.length} max={max} compact />}
        />
      )}

      {access.isOwner ? (
        <ShowcaseEditor
          key={current.id}
          id={current.id}
          username={owner.username}
          ownerTitle={t("of", { name: ownerName })}
          name={current.name}
          untitled={t("untitled", { n: index + 1 })}
          layout={current.layout}
          theme={theme}
          storedTheme={isThemeId(current.theme) ? current.theme : "none"}
          cards={cards}
          showcaseIds={showcases.map((s) => s.id)}
          isMain={index === 0}
          startEditing={query.modifier === "1"}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <ShowcaseHeading
            name={nameOf(index)}
            count={current.count}
            layout={current.layout}
            theme={theme}
            actions={<ShareProfileButton username={owner.username} title={t("of", { name: ownerName })} path={`/u/${owner.username}/vitrines/${current.id}`} label={t("share")} />}
          />
          {await profileSocialBar({ owner, viewer, access, name: ownerName })}
          {current.count > 0 ? (
            <>
              <ShowcaseView
                name={nameOf(index)}
                layout={current.layout}
                theme={theme}
                cards={cards}
                owned={await ownedCardIds(viewer?.id, cardIds)}
                linkBase="/wiki"
                isOwner={false}
                preload
              />
              <VisitorShowcaseBar viewerId={viewer?.id ?? null} cardIds={cardIds} />
            </>
          ) : (
            <p className="lacquer rounded-card p-4 text-sm text-text-muted">{t("emptyPublic")}</p>
          )}
        </div>
      )}
    </PageShell>
  );
}
