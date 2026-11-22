import { getTranslations } from "next-intl/server";
import { KyaraReceiver } from "@/components/admin/kyara/KyaraReceiver";
import { Link } from "@/i18n/navigation";
import { requireAdminView } from "@/server/admin";

/** Réception du lot du favori (fragment d'URL, jamais envoyé à un serveur avant la vérification de l'action). */
export default async function AdminKyaraReceivePage() {
  await requireAdminView();
  const t = await getTranslations("admin.kyara.receive");
  return (
    <div className="flex flex-col gap-4">
      <Link href="/admin/kyara" className="w-fit text-sm underline underline-offset-4">
        {t("back")}
      </Link>
      <h2 className="font-heading text-2xl font-bold">{t("title")}</h2>
      <p className="max-w-prose text-sm text-text-muted">{t("intro")}</p>
      <KyaraReceiver />
    </div>
  );
}
