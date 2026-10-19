import { getTranslations } from "next-intl/server";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { PageShell } from "@/components/PageShell";
import { Link } from "@/i18n/navigation";

export async function generateMetadata() {
  const t = await getTranslations("auth.forgot");
  return { title: t("title") };
}

export default async function ForgotPasswordPage() {
  const t = await getTranslations("auth.forgot");
  return (
    <PageShell>
      <section className="flex flex-col gap-4 lacquer rounded-card p-4">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-text-muted">{t("intro")}</p>
        <ForgotPasswordForm />
        <Link href="/connexion" className="inline-flex min-h-11 w-fit items-center text-sm text-link underline underline-offset-4">
          {t("back")}
        </Link>
      </section>
    </PageShell>
  );
}
