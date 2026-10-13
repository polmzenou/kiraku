import { useTranslations } from "next-intl";
import { PageShell } from "@/components/PageShell";
import { Link } from "@/i18n/navigation";

export default function NotFound() {
  const t = useTranslations("notFound");
  return (
    <PageShell>
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="text-text-muted">{t("body")}</p>
      <Link href="/" className="inline-flex min-h-11 items-center text-ai underline underline-offset-4">
        {t("back")}
      </Link>
    </PageShell>
  );
}
