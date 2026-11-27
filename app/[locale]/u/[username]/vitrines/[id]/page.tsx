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
import { accessFor, anonymousAccess, findProfileOwner } from "@/server/collection/profile";
import { loadProfile } from "@/server/collection/profile-page";
import { ownedCardIds } from "@/server/collection/owned";
import { getSetting } from "@/server/settings";
import { getShowcaseCards, listShowcases } from "@/server/showcase/queries";
import { hasPublishedFresco, playerFrescoes, showcaseFresco } from "@/server/fresco/queries";
import { FrescoPlate } from "@/components/fresco/FrescoPlate";
import { FrescoStage } from "@/components/fresco/FrescoStage";
import { ShowcaseViewSwitch } from "@/components/showcase/ShowcaseViewSwitch";
import { frescoProgress } from "@/lib/fresco/view";
import { referralPreview } from "@/server/referral/preview";
import { getCurrentUser } from "@/server/user";

export async function generateMetadata({ params, searchParams }: PageProps<"/[locale]/u/[username]/vitrines/[id]">): Promise<Metadata> {
  const [{ locale: raw, username: rawUsername, id }, sp] = await Promise.all([params, searchParams]);
  const locale = hasLocale(routing.locales, raw) ? raw : routing.defaultLocale;
  const username = decodeURIComponent(rawUsername);
  const owner = USERNAME_REGEX.test(username) ? await findProfileOwner(username) : null;
  if (!owner) return {};
  // Droits du visiteur, comme la page (session et relation en cache pour la requête) : un aperçu de lien
  // (robot anonyme) ou un visiteur bloqué n'apprend rien d'un profil qu'il ne voit pas
  const [showcases, access] = await Promise.all([listShowcases(owner.id), getCurrentUser().then((viewer) => accessFor(viewer, owner))]);
  const index = showcases.findIndex((s) => s.id === id);
  // Une vitrine privée (pas la principale), ou celle d'un profil caché à ce visiteur, ne dévoile ni son nom ni son contenu
  if (index !== 0 || !access.profile) return { robots: { index: false, follow: false } };
  const [t, tAccount] = await Promise.all([getTranslations({ locale, namespace: "showcase" }), getTranslations({ locale, namespace: "account" })]);
  const name = displayName(owner.username, owner.isGuest, (code) => tAccount("guestName", { code }));
  const showcaseName = showcases[index].name ?? t("untitled", { n: index + 1 });
  const title = t("metaTitle", { name: showcaseName, owner: name });
  const description = t("metaDescription", { name: showcaseName, owner: name, count: showcases[index].count });
  return {
    title,
    description,
    // Comme le profil : jamais indexée, liens suivis seulement s'il est public pour tous
    robots: { index: false, follow: !owner.isGuest && anonymousAccess(owner).profile },
    alternates: { canonical: getPathname({ href: `/u/${owner.username}/vitrines/${id}`, locale }) },
    // Lien partagé avec le code d'un parrain : aperçu de l'invitation
    ...(await referralPreview(sp.ref, locale, title, description)),
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
  const [t, tAccount, tFresco, cards, fresco, frescoOn] = await Promise.all([
    getTranslations("showcase"),
    getTranslations("account"),
    getTranslations("fresco"),
    getShowcaseCards(current.id, owner.id, current.layout, locale),
    // Fragments du propriétaire seulement ; l'image entière une fois la fresque complète
    showcaseFresco(owner.id, current, locale),
    hasPublishedFresco(),
  ]);
  // Choix de la fresque (propriétaire) : rien tant qu'aucune fresque n'est publiée
  const frescoChoices = access.isOwner && frescoOn ? await playerFrescoes(owner.id, locale) : null;
  const frescoLabel = (view: NonNullable<typeof fresco>["view"]) => {
    const { owned, total, complete } = frescoProgress(view);
    return complete ? tFresco("labelComplete", { name: view.name }) : tFresco("label", { name: view.name, owned, total });
  };
  const ownerName = displayName(owner.username, owner.isGuest, (code) => tAccount("guestName", { code }));
  const nameOf = (i: number) => showcases[i].name ?? t("untitled", { n: i + 1 });
  const theme = effectiveTheme(current.theme, setting);
  const tabs = showcases.map((s, i) => ({ id: s.id, name: nameOf(i), theme: effectiveTheme(s.theme, setting) }));
  const cardIds = cards.flatMap((c) => (c ? [c.cardId] : []));
  // Visiteur : barre des relations et pastilles « Acquise », lues ensemble
  const [social, owned] = access.isOwner
    ? [null, []]
    : await Promise.all([profileSocialBar({ owner, viewer, access, name: ownerName }), current.count > 0 ? ownedCardIds(viewer?.id, cardIds) : []]);

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
          fresco={fresco?.view ?? null}
          frescoFirst={fresco?.first ?? false}
          frescoChoices={frescoChoices}
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
          {social}
          {fresco ? (
            // Vitrine avec fresque : mini-navigation « Cartes · Fresque », même décor pour les deux vues
            <ShowcaseViewSwitch
              title={<span />}
              initial={fresco.first ? "fresco" : "cards"}
              cards={
                <>
                  <ShowcaseView
                    name={nameOf(index)}
                    layout={current.layout}
                    theme={theme}
                    cards={cards}
                    owned={owned}
                    linkBase="/wiki"
                    isOwner={false}
                    preload={!fresco.first}
                  />
                  {current.count > 0 && <VisitorShowcaseBar viewerId={viewer?.id ?? null} cardIds={cardIds} owned={owned} />}
                </>
              }
              fresco={
                <>
                  <FrescoStage fresco={fresco.view} theme={theme} label={frescoLabel(fresco.view)} preload={fresco.first} />
                  <FrescoPlate fresco={fresco.view} />
                </>
              }
            />
          ) : current.count > 0 ? (
            <>
              <ShowcaseView
                name={nameOf(index)}
                layout={current.layout}
                theme={theme}
                cards={cards}
                owned={owned}
                linkBase="/wiki"
                isOwner={false}
                preload
              />
              <VisitorShowcaseBar viewerId={viewer?.id ?? null} cardIds={cardIds} owned={owned} />
            </>
          ) : (
            <p className="lacquer rounded-card p-4 text-sm text-text-muted">{t("emptyPublic")}</p>
          )}
        </div>
      )}
    </PageShell>
  );
}
