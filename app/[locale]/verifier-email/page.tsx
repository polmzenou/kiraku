import { getTranslations } from "next-intl/server";
import { VerifyEmailForm } from "@/components/auth/VerifyEmailForm";
import { PageShell } from "@/components/PageShell";
import { tokenSchema } from "@/lib/auth/schemas";

export async function generateMetadata() {
  const t = await getTranslations("auth.verify");
  return { title: t("title") };
}

export default async function VerifyEmailPage({ searchParams }: PageProps<"/[locale]/verifier-email">) {
  const { token } = await searchParams;
  const t = await getTranslations("auth");
  const parsed = tokenSchema.safeParse(token);

  return (
    <PageShell>
      <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
        <h1 className="text-2xl font-bold">{t("verify.title")}</h1>
        {parsed.success ? (
          <>
            <p className="text-text-muted">{t("verify.intro")}</p>
            <VerifyEmailForm token={parsed.data} />
          </>
        ) : (
          <p className="text-text-muted">{t("errors.tokenInvalid")}</p>
        )}
      </section>
    </PageShell>
  );
}
