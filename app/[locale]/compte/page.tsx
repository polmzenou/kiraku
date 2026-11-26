import { getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import Image from "next/image";
import { MailNotSent } from "@/components/auth/MailNotSent";
import { ResendVerificationButton } from "@/components/auth/ResendVerificationButton";
import { GuestBootstrap } from "@/components/GuestBootstrap";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { PageShell } from "@/components/PageShell";
import { AvatarFrame } from "@/components/profile/AvatarFrame";
import { PrivacyForm } from "@/components/profile/PrivacyForm";
import { InstallAppButton } from "@/components/pwa/InstallAppButton";
import { SealMark } from "@/components/SealMark";
import { PlayerName } from "@/components/social/PlayerName";
import { PushToggle } from "@/components/social/PushToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SpoilerToggle } from "@/components/SpoilerToggle";
import { NavLayoutToggle } from "@/components/NavLayoutToggle";
import { Button } from "@/components/ui/Button";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { Link } from "@/i18n/navigation";
import { stockRulesFor } from "@/lib/boosters/stock";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
import { NAV_LAYOUT_COOKIE, parseNavLayout } from "@/lib/nav-layout";
import { guestCode } from "@/lib/username";
import { logout } from "@/server/actions/account";
import { linkDiscord } from "@/server/actions/auth";
import { discordEnabled, env, isProduction, mailEnabled } from "@/server/env";
import { getBoosterRules } from "@/server/boosters/rules";
import { pushAvailable } from "@/server/push/send";
import { getCasinoNav } from "@/server/casino/queries";
import { kyaraTileVisible } from "@/server/kyara/queries";
import { getSetting } from "@/server/settings";
import { getCurrentUser } from "@/server/user";

// Grille de tuiles du Compte (comme Kyara) : les écrans hors barre de navigation
const ACCOUNT_TILES = [
  { key: "missions", href: "/missions", kanji: "任" },
  { key: "expedition", href: "/expedition", kanji: "遠" },
  { key: "shop", href: "/boutique", kanji: "商" },
  { key: "referral", href: "/parrainage", kanji: "招" },
  { key: "ledger", href: "/compte/historique", kanji: "銭" },
  { key: "data", href: "/compte/donnees", kanji: "私" },
  { key: "social", href: "/social", kanji: "縁" },
  { key: "casino", href: "/casino", kanji: "賭" },
  { key: "kyaraImport", href: "/compte/import-kyara", kanji: "越" },
] as const;

export default async function AccountPage() {
  const [t, user, [theme, navLayout]] = await Promise.all([
    getTranslations(),
    getCurrentUser(),
    cookies().then((c) => [parseTheme(c.get(THEME_COOKIE)?.value), parseNavLayout(c.get(NAV_LAYOUT_COOKIE)?.value)] as const),
  ]);

  if (!user) {
    return (
      <PageShell>
        <GuestBootstrap />
      </PageShell>
    );
  }

  const [rules, discordBonus, push, casino, expedition, kyara] = await Promise.all([
    getBoosterRules(),
    getSetting("discord.linkBonusZeni"),
    pushAvailable(),
    getCasinoNav(),
    getSetting("expedition.enabled"),
    kyaraTileVisible(user, new Date().getTime()),
  ]);
  // Casino : tuile selon sa phase ; expéditions : tuile masquée tant que l'admin ne les allume pas ; import Kyara :
  // pendant la fenêtre du joueur, ou tant qu'il a une demande à suivre ou à relire
  const tiles = ACCOUNT_TILES.filter(
    (tile) => (tile.key !== "casino" || casino.visible) && (tile.key !== "expedition" || expedition) && (tile.key !== "kyaraImport" || kyara),
  );
  // Même pastille que le menu : « Bientôt » au teaser, « Nouveau » après l'ouverture
  const casinoTag = casino.badge;
  const code = guestCode(user.username);
  const displayName = user.isGuest && code ? t("account.guestName", { code }) : user.username;
  const canLinkDiscord = discordEnabled && !user.discordLinkedAt;

  const discordForm = (
    <form action={linkDiscord}>
      <input type="hidden" name="redirectTo" value="/compte" />
      <Button type="submit" className="w-full">
        {t("account.linkDiscord")}
      </Button>
    </form>
  );

  return (
    <PageShell>
      <h1 className="sr-only">{t("account.title")}</h1>

      <section className="flex items-center gap-4 lacquer rounded-card p-4">
        <AvatarFrame frame={user.decor.frame} prestige={user.decor.prestige} size={56}>
          {user.image ? (
            <Image
              src={user.image}
              alt={t("account.avatarAlt", { name: displayName })}
              width={56}
              height={56}
              className="rounded-full"
            />
          ) : (
            <SealMark glyphs="新" size={56} />
          )}
        </AvatarFrame>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="truncate font-title text-xl font-bold">
            <PlayerName name={displayName} color={user.decor.nameColor} className="truncate" />
          </p>
          {user.isGuest && (
            <span className="w-fit rounded-sm border border-border px-2 text-xs text-text-muted">
              {t("account.guestBadge")}
            </span>
          )}
        </div>
      </section>

      <ButtonLink href={`/u/${user.username}`}>{t("account.publicProfile")}</ButtonLink>

      <dl className="grid grid-cols-2 gap-3">
        <div className="relative lacquer rounded-card p-4">
          <dt className="text-sm text-text-muted">{t("account.balance")}</dt>
          <dd className="text-lg font-bold text-kin">
            {/* Toute la case mène à l'historique des Zeni */}
            <Link href="/compte/historique" className="after:absolute after:inset-0 after:content-['']">
              {t("common.zeni", { amount: user.coins })}
            </Link>
          </dd>
        </div>
        <div className="lacquer rounded-card p-4">
          <dt className="text-sm text-text-muted">{t("account.boosterStock")}</dt>
          <dd className="text-lg font-bold">{t("common.boosters", { count: user.boosterStock, max: stockRulesFor(rules.stock, user.ambassadorSince !== null).max })}</dd>
        </div>
      </dl>

      <nav aria-label={t("account.tilesLabel")}>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {tiles.map((tile) => (
            <li key={tile.key}>
              <Link
                href={tile.href}
                className="flex min-h-20 flex-col items-start justify-between gap-1 lacquer rounded-card p-3 font-bold hover:border-shu"
              >
                <span aria-hidden="true" lang="ja" className="font-seal text-xl text-shu">
                  {tile.kanji}
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  {t(`account.tiles.${tile.key}`)}
                  {tile.key === "casino" && casinoTag === "soon" && (
                    <span className="rounded-sm border border-border px-1.5 text-[10px] font-normal tracking-wide text-text-muted uppercase">
                      {t("nav.soon")}
                    </span>
                  )}
                  {tile.key === "casino" && casinoTag === "new" && (
                    <span className="rounded-sm bg-kin px-1.5 text-[10px] tracking-wide text-sumi uppercase">{t("nav.new")}</span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {user.isGuest ? (
        <section className="flex flex-col gap-3 lacquer rounded-card p-4">
          <h2 className="text-lg font-bold">{t("account.linkTitle")}</h2>
          <p className="text-sm text-text-muted">{t("account.linkBody")}</p>
          <ButtonLink href="/inscription" variant="primary">
            {t("account.createAccount")}
          </ButtonLink>
          {canLinkDiscord && discordForm}
          <ButtonLink href="/connexion">{t("account.haveAccount")}</ButtonLink>
        </section>
      ) : (
        <>
          {user.email && (
            <section className="flex flex-col gap-2 lacquer rounded-card p-4">
              <p className="text-sm text-text-muted">{t("account.emailLabel")}</p>
              <p className="break-all">{user.email}</p>
              {user.emailVerified ? (
                <p className="text-sm text-text-muted">{t("account.emailVerified")}</p>
              ) : (
                <>
                  <p className="text-sm text-shu">{t("account.emailUnverified")}</p>
                  {mailEnabled || !isProduction ? <ResendVerificationButton /> : <MailNotSent />}
                </>
              )}
            </section>
          )}

          {canLinkDiscord && (
            <section className="flex flex-col gap-3 lacquer rounded-card p-4">
              <h2 className="text-lg font-bold">{t("account.discordBonusTitle")}</h2>
              {discordBonus > 0 && (
                <p className="text-sm text-kin">{t("account.discordBonusBody", { amount: discordBonus })}</p>
              )}
              {discordForm}
            </section>
          )}
          {user.discordLinkedAt && <p className="text-sm text-text-muted">{t("account.discordLinked")}</p>}
        </>
      )}

      <section id="confidentialite" className="flex scroll-mt-20 flex-col gap-3 lacquer rounded-card p-4">
        <h2 className="text-lg font-bold">{t("privacy.title")}</h2>
        <p className="text-sm text-text-muted">{t("privacy.intro")}</p>
        <PrivacyForm visibility={user.profileVisibility} showCollection={user.showCollection} />
      </section>

      {/* Invités exclus : sans social, ils ne reçoivent aucune notification */}
      {push && !user.isGuest && env.VAPID_PUBLIC_KEY && (
        <section id="notifications" className="flex scroll-mt-20 flex-col gap-3 lacquer rounded-card p-4">
          <h2 className="text-lg font-bold">{t("push.title")}</h2>
          <PushToggle publicKey={env.VAPID_PUBLIC_KEY} />
        </section>
      )}

      <InstallAppButton />

      <section className="flex flex-col gap-5 lacquer rounded-card p-4">
        <h2 className="text-lg font-bold">{t("account.settings")}</h2>
        <ThemeToggle initial={theme} />
        <SpoilerToggle showUniversesLink />
        <NavLayoutToggle initial={navLayout} />
        <LocaleSwitcher />
      </section>

      {!user.isGuest && (
        <form action={logout}>
          <Button type="submit" className="w-full">
            {t("account.logout")}
          </Button>
        </form>
      )}
    </PageShell>
  );
}
