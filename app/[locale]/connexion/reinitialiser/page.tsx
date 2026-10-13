import { getTranslations } from "next-intl/server";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { PageShell } from "@/components/PageShell";
import { Link } from "@/i18n/navigation";
import { tokenSchema } from "@/lib/auth/schemas";

export async function generateMetadata() {
  const t = await getTranslations("auth.reset");
  return { title: t("title") };
}

export default async function ResetPasswordPage({ searchParams }: PageProps<"/[locale]/connexion/reinitialiser">) {
  const { token } = await searchParams;
  const t = await getTranslations("auth");
  const parsed = tokenSchema.safeParse(token);

  return (
    <PageShell>
      <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
        <h1 className="text-2xl font-bold">{t("reset.title")}</h1>
        {parsed.success ? (
          <ResetPasswordForm token={parsed.data} />
        ) : (
          <>
            <p className="text-text-muted">{t("reset.missingToken")}</p>
            <Link
              href="/connexion/mot-de-passe-oublie"
              className="inline-flex min-h-11 w-fit items-center text-ai underline underline-offset-4"
            >
              {t("forgot.title")}
            </Link>
          </>
        )}
      </section>
    </PageShell>
  );
}
