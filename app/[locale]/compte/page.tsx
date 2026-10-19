import { getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import Image from "next/image";
import { MailNotSent } from "@/components/auth/MailNotSent";
import { ResendVerificationButton } from "@/components/auth/ResendVerificationButton";
import { GuestBootstrap } from "@/components/GuestBootstrap";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { PageShell } from "@/components/PageShell";
import { PrivacyForm } from "@/components/profile/PrivacyForm";
import { InstallAppButton } from "@/components/pwa/InstallAppButton";
import { SealMark } from "@/components/SealMark";
import { PushToggle } from "@/components/social/PushToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/Button";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { Link } from "@/i18n/navigation";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
import { guestCode } from "@/lib/username";
import { logout } from "@/server/actions/account";
import { linkDiscord } from "@/server/actions/auth";
import { discordEnabled, env, isProduction, mailEnabled } from "@/server/env";
import { pushAvailable } from "@/server/push/send";
import { getSetting } from "@/server/settings";
import { getCurrentUser } from "@/server/user";

// Grille de tuiles du Compte (comme Kyara) : les écrans hors barre de navigation
const ACCOUNT_TILES = [
  { key: "missions", href: "/missions", kanji: "任" },
  { key: "shop", href: "/boutique", kanji: "商" },
  { key: "referral", href: "/parrainage", kanji: "招" },
  { key: "ledger", href: "/compte/historique", kanji: "銭" },
  { key: "data", href: "/compte/donnees", kanji: "私" },
  { key: "casino", href: "/casino", kanji: "賭", soon: true },
] as const;

export default async function AccountPage() {
  const [t, user, theme] = await Promise.all([
    getTranslations(),
    getCurrentUser(),
    cookies().then((c) => parseTheme(c.get(THEME_COOKIE)?.value)),
  ]);

  if (!user) {
    return (
      <PageShell>
        <GuestBootstrap />
      </PageShell>
    );
  }

  const [maxStock, discordBonus, push, casino] = await Promise.all([
    getSetting("booster.maxStock"),
    getSetting("discord.linkBonusZeni"),
    pushAvailable(),
    getSetting("features.casino"),
  ]);
  const tiles = ACCOUNT_TILES.filter((tile) => tile.key !== "casino" || casino);
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

      <section className="flex items-center gap-4 rounded-lg border border-border bg-surface p-4">
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
        <div className="flex min-w-0 flex-col gap-1">
          <p className="truncate font-title text-xl font-bold">{displayName}</p>
          {user.isGuest && (
            <span className="w-fit rounded-sm border border-border px-2 text-xs text-text-muted">
              {t("account.guestBadge")}
            </span>
          )}
        </div>
      </section>

      <ButtonLink href={`/u/${user.username}`}>{t("account.publicProfile")}</ButtonLink>

      <dl className="grid grid-cols-2 gap-3">
        <div className="relative rounded-lg border border-border bg-surface p-4">
          <dt className="text-sm text-text-muted">{t("account.balance")}</dt>
          <dd className="text-lg font-bold text-kin">
            {/* Toute la case mène à l'historique des Zeni */}
            <Link href="/compte/historique" className="after:absolute after:inset-0 after:content-['']">
              {t("common.zeni", { amount: user.coins })}
            </Link>
          </dd>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <dt className="text-sm text-text-muted">{t("account.boosterStock")}</dt>
          <dd className="text-lg font-bold">{t("common.boosters", { count: user.boosterStock, max: maxStock })}</dd>
        </div>
      </dl>

      <nav aria-label={t("account.tilesLabel")}>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {tiles.map((tile) => (
            <li key={tile.key}>
              <Link
                href={tile.href}
                className="flex min-h-20 flex-col items-start justify-between gap-1 rounded-lg border border-border bg-surface p-3 font-bold hover:border-shu"
              >
                <span aria-hidden="true" lang="ja" className="font-seal text-xl text-shu">
                  {tile.kanji}
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  {t(`account.tiles.${tile.key}`)}
                  {"soon" in tile && (
                    <span className="rounded-sm border border-border px-1.5 text-[10px] font-normal tracking-wide text-text-muted uppercase">
                      {t("nav.soon")}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {user.isGuest ? (
        <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
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
            <section className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
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
            <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
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

      <section id="confidentialite" className="flex scroll-mt-20 flex-col gap-3 rounded-lg border border-border bg-surface p-4">
        <h2 className="text-lg font-bold">{t("privacy.title")}</h2>
        <p className="text-sm text-text-muted">{t("privacy.intro")}</p>
        <PrivacyForm visibility={user.profileVisibility} showCollection={user.showCollection} />
      </section>

      {/* Invités exclus : sans social, ils ne reçoivent aucune notification */}
      {push && !user.isGuest && env.VAPID_PUBLIC_KEY && (
        <section id="notifications" className="flex scroll-mt-20 flex-col gap-3 rounded-lg border border-border bg-surface p-4">
          <h2 className="text-lg font-bold">{t("push.title")}</h2>
          <PushToggle publicKey={env.VAPID_PUBLIC_KEY} />
        </section>
      )}

      <InstallAppButton />

      <section className="flex flex-col gap-5 rounded-lg border border-border bg-surface p-4">
        <h2 className="text-lg font-bold">{t("account.settings")}</h2>
        <ThemeToggle initial={theme} />
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
