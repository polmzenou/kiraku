import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { NETWORK_BAN_KANJI } from "@/lib/anticheat/network";
import { getSetting } from "@/server/settings";

const link = "inline-flex min-h-11 items-center font-medium text-ai underline underline-offset-4";

/**
 * Écran d'un réseau banni (server/anticheat/network-ban.ts) : il remplace toute page sauf les textes légaux et la
 * connexion. Rien sur le ban lui-même (ni IP ni date) : seulement de quoi signaler une erreur.
 */
export async function NetworkBanScreen() {
  const [t, join] = await Promise.all([getTranslations("networkBan"), getSetting("discord.joinModal")]);
  return (
    <main className="mx-auto flex min-h-[calc(100dvh-3.5rem-var(--mobile-nav-height))] w-full max-w-xl flex-col justify-center gap-5 px-4 py-8">
      <span aria-hidden="true" lang="ja" className="font-seal text-4xl text-shu">
        {NETWORK_BAN_KANJI}
      </span>
      <h1 className="font-heading text-2xl font-extrabold">{t("title")}</h1>
      <p className="text-text-muted">{t("body")}</p>
      <p>
        {join.inviteUrl
          ? t.rich("contact", {
              link: (chunks) => (
                <a href={join.inviteUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-ai underline underline-offset-4">
                  {chunks}
                </a>
              ),
            })
          : t("contactLegal")}
      </p>
      <ul className="flex flex-col gap-1">
        <li>
          <Link href="/mentions-legales" className={link}>
            {t("legal")}
          </Link>
        </li>
        <li>
          <Link href="/cgu" className={link}>
            {t("terms")}
          </Link>
        </li>
        <li>
          <Link href="/confidentialite" className={link}>
            {t("privacy")}
          </Link>
        </li>
      </ul>
    </main>
  );
}
