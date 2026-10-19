import { getFormatter, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/server/admin";
import { legalOverview } from "@/server/admin/legal";
import { getSetting } from "@/server/settings";

/** Pages légales : version en vigueur de chaque page, brouillon en cours, version des CGU exigée. */
export default async function AdminLegalPage() {
  await requireAdmin();
  const [t, tLegal, format, pages, required] = await Promise.all([
    getTranslations("admin.legal"),
    getTranslations("legal"),
    getFormatter(),
    legalOverview(),
    getSetting("legal.termsRequiredVersion"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-title text-2xl font-bold">{t("title")}</h2>
        <p className="max-w-prose text-sm text-text-muted">{t("intro")}</p>
        <p className="text-sm font-bold tabular-nums">{t("requiredVersion", { version: required })}</p>
      </div>
      <ul className="flex flex-col gap-2">
        {pages.map((p) => (
          <li
            key={p.slug}
            className="flex flex-col gap-2 rounded-control border border-border bg-surface p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex flex-col gap-0.5 text-sm">
              <p className="font-bold">{tLegal(`titles.${p.slug}`)}</p>
              <p className="text-text-muted">
                {p.version
                  ? t("current", {
                      version: p.version,
                      date: p.publishedAt ? format.dateTime(p.publishedAt, { dateStyle: "medium" }) : "—",
                    })
                  : t("nothingPublished")}
              </p>
              {p.draftVersion && <p className="text-kin">{t("draftPending", { version: p.draftVersion })}</p>}
            </div>
            <Link
              href={`/admin/legal/${p.slug}`}
              className="inline-flex min-h-11 items-center justify-center rounded-control border border-border bg-surface-2 px-4 text-sm font-bold"
            >
              {t("editLink")}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
