import { getLocale, getTranslations } from "next-intl/server";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { PageShell } from "@/components/PageShell";
import { Link, redirect } from "@/i18n/navigation";
import { getCurrentUser } from "@/server/user";

export async function generateMetadata() {
  const t = await getTranslations("auth.register");
  return { title: t("title") };
}

export default async function RegisterPage() {
  const [t, user] = await Promise.all([getTranslations("auth"), getCurrentUser()]);
  if (user && !user.isGuest) redirect({ href: "/", locale: await getLocale() });

  return (
    <PageShell>
      <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
        <h1 className="text-2xl font-bold">{t("register.title")}</h1>
        {user?.isGuest && <p className="text-sm text-text-muted">{t("register.intro")}</p>}
        <RegisterForm />
        <p className="text-sm text-text-muted">
          {t("register.haveAccount")}{" "}
          <Link href="/connexion" className="inline-flex min-h-11 items-center text-ai underline underline-offset-4">
            {t("register.login")}
          </Link>
        </p>
      </section>
    </PageShell>
  );
}
