import { getLocale, getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/auth/AuthShell";
import { DiscordButton } from "@/components/auth/DiscordButton";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { Link, redirect } from "@/i18n/navigation";
import { discordEnabled } from "@/server/env";
import { HONEYPOT_FIELD, issueFormToken } from "@/server/form-guard";
import { getCurrentUser } from "@/server/user";

export async function generateMetadata() {
  const t = await getTranslations("auth.register");
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function RegisterPage() {
  const [t, user] = await Promise.all([getTranslations("auth"), getCurrentUser()]);
  if (user && !user.isGuest) redirect({ href: "/", locale: await getLocale() });

  return (
    <AuthShell
      kanji="登録"
      title={t("register.title")}
      subtitle={t("register.subtitle")}
      asideTitle={t("register.asideTitle")}
      perks={[
        { kanji: "守", text: t("perks.keep") },
        { kanji: "市", text: t("perks.market") },
        { kanji: "友", text: t("perks.friends") },
      ]}
      notice={user?.isGuest ? t("register.intro") : undefined}
      footer={
        <p>
          {t("register.haveAccount")}{" "}
          <Link href="/connexion" className="inline-flex min-h-11 items-center font-medium text-link underline underline-offset-4">
            {t("register.login")}
          </Link>
        </p>
      }
    >
      <div className="flex flex-col gap-4">
        {discordEnabled && <DiscordButton intent="register" />}
        {/* Jeton signé à chaque rendu : il prouve que le formulaire vient de cette page */}
        <RegisterForm formToken={issueFormToken("register")} honeypot={HONEYPOT_FIELD} />
      </div>
    </AuthShell>
  );
}
