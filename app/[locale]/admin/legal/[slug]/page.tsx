import { getFormatter, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { LegalEditor, type LegalEditorText } from "@/components/admin/LegalEditor";
import { Link } from "@/i18n/navigation";
import { nextLegalVersion } from "@/lib/legal/admin";
import { isLegalSlug, LEGAL_LOCALES, type LegalLocale } from "@/lib/legal/legal";
import { requireAdmin } from "@/server/admin";
import { legalVersions } from "@/server/admin/legal";

/** Édition d'une page légale : brouillon de la prochaine version, publication, historique. */
export default async function AdminLegalEditPage({ params }: PageProps<"/[locale]/admin/legal/[slug]">) {
  await requireAdmin();
  const { slug } = await params;
  if (!isLegalSlug(slug)) notFound();
  const [t, tLegal, format, rows] = await Promise.all([
    getTranslations("admin.legal"),
    getTranslations("legal"),
    getFormatter(),
    legalVersions(slug),
  ]);

  const draftVersion = rows.find((r) => r.status === "DRAFT")?.version ?? null;
  const latestPublished = rows.find((r) => r.status === "PUBLISHED")?.version ?? null;
  // Départ de l'éditeur : le brouillon de chaque langue, sinon le texte en vigueur
  const initial = Object.fromEntries(
    LEGAL_LOCALES.map((l) => {
      const row =
        rows.find((r) => r.locale === l && r.version === draftVersion) ??
        rows.find((r) => r.locale === l && r.version === latestPublished);
      return [l, { title: row?.title ?? "", body: row?.body ?? "" }];
    }),
  ) as Record<LegalLocale, LegalEditorText>;
  const versions = [...new Set(rows.map((r) => r.version))];

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/legal" className="inline-flex min-h-11 items-center self-start text-sm text-text-muted hover:underline">
        ← {t("title")}
      </Link>
      <h2 className="font-heading text-2xl font-bold">{tLegal(`titles.${slug}`)}</h2>
      <LegalEditor slug={slug} draftVersion={draftVersion} nextVersion={nextLegalVersion(versions)} initial={initial} />

      <section className="flex flex-col gap-2">
        <h3 className="font-bold">{t("history")}</h3>
        <ul className="flex flex-col divide-y divide-border text-sm">
          {versions.map((v) => {
            const ofVersion = rows.filter((r) => r.version === v);
            const head = ofVersion[0];
            return (
              <li key={v} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <span className="font-bold tabular-nums">v{v}</span>
                <span className="text-text-muted">{ofVersion.map((r) => r.locale.toUpperCase()).join(" · ")}</span>
                <span>
                  {head.status === "PUBLISHED"
                    ? t("publishedBy", {
                        date: head.publishedAt ? format.dateTime(head.publishedAt, { dateStyle: "medium", timeStyle: "short" }) : "—",
                        admin: head.publishedBy?.username ?? "—",
                      })
                    : t("draft")}
                </span>
                {head.status === "PUBLISHED" && (
                  <Link href={v === latestPublished ? `/${slug}` : `/${slug}?v=${v}`} className="text-ai underline underline-offset-4">
                    {t("view")}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
