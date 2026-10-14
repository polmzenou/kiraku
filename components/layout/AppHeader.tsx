import { getTranslations } from "next-intl/server";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import type { Theme } from "@/lib/theme";
import { getBoosterRules } from "@/server/boosters/rules";
import { boosterStateFrom } from "@/server/boosters/state";
import { getSetting } from "@/server/settings";
import { unreadNotifications } from "@/server/social/queries";
import { getCurrentUser } from "@/server/user";
import { SealMark } from "../SealMark";
import { NotificationBell } from "../social/NotificationBell";
import { MobileMenu } from "./MobileMenu";
import { NavLinks } from "./NavLinks";
import { StockEnso } from "./StockEnso";
import { ZeniCoin } from "./ZeniCoin";

/**
 * En-tête fixe : logo, navigation (barre ≥ 1024 px, burger en dessous), stock ensō et solde.
 * Le stock est calculé ici, côté serveur ; le client n'affiche que le compte à rebours.
 */
export async function AppHeader({ theme }: { theme: Theme }) {
  const [t, user] = await Promise.all([getTranslations(), getCurrentUser()]);
  const state = user ? boosterStateFrom(user, await getBoosterRules()) : null;
  const isAdmin = user?.role === "ADMIN";
  const [unread, pollSeconds] = user
    ? await Promise.all([unreadNotifications(user.id), getSetting("notifications.pollSeconds")])
    : [0, 0];

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/95 pt-[env(safe-area-inset-top)] backdrop-blur supports-[backdrop-filter]:bg-bg/85">
      <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center gap-2 px-4 md:h-16 md:gap-4">
        <Link href="/" aria-label={t("nav.home")} className="flex min-h-11 min-w-0 shrink-0 items-center gap-2">
          <SealMark glyphs="気楽" size={32} />
          <span className="font-title text-xl font-extrabold tracking-wide">{t("common.appName")}</span>
        </Link>

        <nav aria-label={t("nav.label")} className="ml-4 hidden lg:block">
          <NavLinks layout="bar" />
        </nav>

        <div className="ml-auto flex min-w-0 items-center gap-1.5 md:gap-3">
          {state && (
            <StockEnso
              stock={state.stock}
              max={state.max}
              nextAt={state.nextAt}
              intervalMs={state.intervalMs}
              serverNow={state.serverNow}
            />
          )}
          {user && (
            <span
              className="inline-flex min-h-9 min-w-0 items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 text-sm font-bold"
              aria-label={t("header.balance", { amount: user.coins })}
              title={t("header.balance", { amount: user.coins })}
            >
              <ZeniCoin size={16} />
              <span aria-hidden="true" className="truncate tabular-nums">
                {t("common.number", { value: user.coins })}
              </span>
            </span>
          )}
          {user && <NotificationBell initial={unread} serverNow={new Date().toISOString()} pollSeconds={pollSeconds} />}
          {isAdmin && (
            <Link
              href="/admin"
              className="hidden min-h-11 items-center rounded-button px-2 text-sm text-text-muted hover:text-text lg:inline-flex"
            >
              {t("nav.admin")}
            </Link>
          )}
          <Link
            href="/compte"
            aria-label={t("nav.account")}
            title={t("nav.account")}
            className="hidden size-11 items-center justify-center lg:inline-flex"
          >
            {user?.image ? (
              <Image src={user.image} alt="" width={32} height={32} className="rounded-full" />
            ) : (
              <span
                aria-hidden="true"
                className="flex size-8 items-center justify-center rounded-full border border-border bg-surface-2 font-title text-sm font-bold"
              >
                {user?.username.charAt(0).toUpperCase() ?? "?"}
              </span>
            )}
          </Link>
          <MobileMenu theme={theme} isAdmin={isAdmin} />
        </div>
      </div>
    </header>
  );
}
