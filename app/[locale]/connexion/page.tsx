import { getLocale, getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/auth/AuthShell";
import { DiscordButton } from "@/components/auth/DiscordButton";
import { LoginForm } from "@/components/auth/LoginForm";
import { Link, redirect } from "@/i18n/navigation";
import { discordEnabled } from "@/server/env";
import { getCurrentUser } from "@/server/user";

export async function generateMetadata() {
  const t = await getTranslations("auth.login");
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function LoginPage() {
  const [t, user] = await Promise.all([getTranslations("auth"), getCurrentUser()]);
  if (user && !user.isGuest) redirect({ href: "/", locale: await getLocale() });

  return (
    <AuthShell
      kanji="入場"
      title={t("login.title")}
      subtitle={t("login.subtitle")}
      asideTitle={t("login.asideTitle")}
      perks={[
        { kanji: "札", text: t("perks.collection") },
        { kanji: "市", text: t("perks.market") },
        { kanji: "友", text: t("perks.friends") },
      ]}
      notice={user?.isGuest ? t("login.guestWarning") : undefined}
      footer={
        <p>
          {t("login.noAccount")}{" "}
          <Link href="/inscription" className="inline-flex min-h-11 items-center font-medium text-link underline underline-offset-4">
            {t("login.register")}
          </Link>
        </p>
      }
    >
      <div className="flex flex-col gap-4">
        {discordEnabled && <DiscordButton intent="login" />}
        <LoginForm />
      </div>
    </AuthShell>
  );
}
