import { getTranslations } from "next-intl/server";
import { isStaff } from "@/lib/admin/roles";
import { Link } from "@/i18n/navigation";
import type { Theme } from "@/lib/theme";
import { logout } from "@/server/actions/account";
import { isFrozen } from "@/lib/account/deletion";
import { getBoosterRules } from "@/server/boosters/rules";
import { unreadChatCount, visibleSince } from "@/server/chat/queries";
import { boosterStateFrom } from "@/server/boosters/state";
import { getSetting } from "@/server/settings";
import { unreadNotifications } from "@/server/social/queries";
import { getCurrentUser } from "@/server/user";
import { ChatDock, ChatHeaderButton } from "../chat/ChatDock";
import { SealMark } from "../SealMark";
import { NotificationBell } from "../social/NotificationBell";
import { PlayerAvatar } from "../social/PlayerAvatar";
import { iconButtonClasses } from "../ui/IconButton";
import { MobileMenu } from "./MobileMenu";
import { NavLinks } from "./NavLinks";
import { StockEnso } from "./StockEnso";
import { ZeniCoin } from "./ZeniCoin";

/**
 * En-tête fixe : logo, navigation desktop, stock ensō, solde et notifications.
 * La navigation mobile est rendue à côté pour ne pas piéger son `fixed` dans le backdrop-filter.
 * Le stock est calculé ici, côté serveur ; le client n'affiche que le compte à rebours.
 */
export async function AppHeader({ theme }: { theme: Theme }) {
  const [t, user] = await Promise.all([getTranslations(), getCurrentUser()]);
  const accountHref = user ? `/u/${user.username}` : "/connexion";
  // Lien « Admin » pour toute l'équipe : le DEV y trouve le catalogue seulement
  const isAdmin = isStaff(user?.role);
  const signedIn = Boolean(user && !user.isGuest);
  const authLabel = signedIn ? t("account.logout") : t("auth.login.title");
  const [unread, pollSeconds, safetySeconds, casino, boosterRules] = await Promise.all([
    user ? unreadNotifications(user.id) : 0,
    user ? getSetting("notifications.pollSeconds") : 0,
    user ? getSetting("realtime.safetyPollSeconds") : 0,
    getSetting("features.casino"),
    user ? getBoosterRules() : null,
  ]);
  const state = user && boosterRules ? boosterStateFrom(user, boosterRules) : null;
  const features = { casino };
  // Chat entre amis : comptes inscrits, actifs, avec le social et le chat ouverts
  const chatUser = user && !user.isGuest && !user.bannedAt && !isFrozen(user) ? user : null;
  const [socialOn, chatOn] = chatUser ? await Promise.all([getSetting("social.enabled"), getSetting("chat.enabled")]) : [false, false];
  const chat =
    chatUser && socialOn && chatOn
      ? await Promise.all([getSetting("chat.retentionHours"), getSetting("chat.pollSeconds"), getSetting("chat.maxLength")]).then(
          async ([retentionHours, chatPoll, maxLength]) => ({
            initialUnread: await unreadChatCount(chatUser.id, visibleSince(retentionHours)),
            pollSeconds: chatPoll,
            maxLength,
            retentionHours,
          }),
        )
      : null;

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border/60 bg-bg/95 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center gap-2 px-4 md:h-16 md:gap-4">
          <Link prefetch={false} href="/" aria-label={t("nav.home")} className="flex min-h-11 min-w-0 shrink-0 items-center gap-2">
            <SealMark glyphs="気楽" size={32} />
            <span className="hidden font-title text-xl font-extrabold tracking-wide sm:inline">{t("common.appName")}</span>
          </Link>

          <nav aria-label={t("nav.label")} className="ml-2 hidden lg:block">
            <NavLinks layout="bar" features={features} />
          </nav>

          <div className="ml-auto flex min-w-0 items-center gap-1.5 md:gap-2">
            {/* Capsule de statut : stock ensō | solde Zeni, séparés par un filet */}
            {user && (
              <div className="lacquer flex min-w-0 shrink-0 items-center rounded-pill">
                {state && (
                  <>
                    <StockEnso
                      stock={state.stock}
                      max={state.max}
                      nextAt={state.nextAt}
                      intervalMs={state.intervalMs}
                      serverNow={state.serverNow}
                    />
                    <span aria-hidden="true" className="h-4 w-px bg-border" />
                  </>
                )}
                <Link prefetch={false}
                  href="/compte/historique"
                  className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-r-pill pr-3.5 text-sm font-bold ${state ? "pl-2.5" : "rounded-l-pill pl-3.5"}`}
                  aria-label={t("header.balance", { amount: user.coins })}
                  title={t("header.balance", { amount: user.coins })}
                >
                  <ZeniCoin size={16} />
                  <span aria-hidden="true" className="whitespace-nowrap tabular-nums">
                    {t("common.number", { value: user.coins })}
                  </span>
                </Link>
              </div>
            )}
            {chat && <ChatHeaderButton />}
            {user && <NotificationBell initial={unread} serverNow={new Date().toISOString()} pollSeconds={pollSeconds} safetySeconds={safetySeconds} />}
            {isAdmin && (
              <Link prefetch={false}
                href="/admin"
                className="hidden min-h-11 items-center rounded-pill px-3 text-sm text-text-muted hover:bg-surface-2 hover:text-text lg:inline-flex"
              >
                {t("nav.admin")}
              </Link>
            )}
            {user && (
              <Link prefetch={false}
                href={accountHref}
                aria-label={t("nav.account")}
                title={t("nav.account")}
                className="hidden size-11 shrink-0 items-center justify-center rounded-full lg:inline-flex"
              >
                <PlayerAvatar username={user.username} image={user.image} size={34} frame={user.decor.frame} />
              </Link>
            )}
            {signedIn ? (
              <form action={logout} className="hidden shrink-0 lg:block">
                <button type="submit" aria-label={authLabel} title={authLabel} className={iconButtonClasses("shu")}>
                  <AuthIcon signOut />
                </button>
              </form>
            ) : (
              <Link prefetch={false} href="/connexion" aria-label={authLabel} title={authLabel} className={iconButtonClasses("shu", "max-lg:hidden")}>
                <AuthIcon />
              </Link>
            )}
          </div>
        </div>
      </header>
      <MobileMenu theme={theme} isAdmin={isAdmin} accountHref={accountHref} signedIn={signedIn} features={features} />
      {chat && <ChatDock {...chat} />}
    </>
  );
}

function AuthIcon({ signOut = false }: { signOut?: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      {signOut ? (
        <>
          <path d="M9 5H5v14h4M13 12h8m-3-3 3 3-3 3" />
          <path d="m9 3 6 2v14l-6 2V3Z" />
        </>
      ) : (
        <>
          <path d="M15 3h4v18h-4M3 12h10m-3-3 3 3-3 3" />
          <path d="m9 3 6 2v14l-6 2V3Z" />
        </>
      )}
    </svg>
  );
}
