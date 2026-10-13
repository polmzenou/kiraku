import { getLocale, getTranslations } from "next-intl/server";
import { LoginForm } from "@/components/auth/LoginForm";
import { PageShell } from "@/components/PageShell";
import { Link, redirect } from "@/i18n/navigation";
import { getCurrentUser } from "@/server/user";

export async function generateMetadata() {
  const t = await getTranslations("auth.login");
  return { title: t("title") };
}

export default async function LoginPage() {
  const [t, user] = await Promise.all([getTranslations("auth"), getCurrentUser()]);
  if (user && !user.isGuest) redirect({ href: "/", locale: await getLocale() });

  return (
    <PageShell>
      <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
        <h1 className="text-2xl font-bold">{t("login.title")}</h1>
        {user?.isGuest && <p className="text-sm text-text-muted">{t("login.guestWarning")}</p>}
        <LoginForm />
        <Link
          href="/connexion/mot-de-passe-oublie"
          className="inline-flex min-h-11 w-fit items-center text-sm text-ai underline underline-offset-4"
        >
          {t("login.forgot")}
        </Link>
        <p className="text-sm text-text-muted">
          {t("login.noAccount")}{" "}
          <Link href="/inscription" className="inline-flex min-h-11 items-center text-ai underline underline-offset-4">
            {t("login.register")}
          </Link>
        </p>
      </section>
    </PageShell>
  );
}
