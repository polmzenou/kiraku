import { hasLocale } from "next-intl";
import { getFormatter, getTranslations } from "next-intl/server";
import { PageShell } from "@/components/PageShell";
import { SectionTitle } from "@/components/SectionTitle";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { localeAlternates } from "@/lib/seo/alternates";
import type { LegalSlug } from "@/lib/legal/legal";
import { getAdmin } from "@/server/admin";
import { getLegalDocument } from "@/server/legal";
import { CookieTable } from "../consent/CookieTable";
import { ManageCookiesButton } from "../consent/ManageCookiesButton";
import { LegalMarkdown } from "./LegalMarkdown";
import { XFollowLink } from "../layout/XFollowLink";

const KANJI: Record<LegalSlug, string> = {
  "mentions-legales": "記",
  confidentialite: "秘",
  cookies: "菓",
  cgu: "約",
};

/** Lit `?v=N` : une ancienne version publiée reste consultable. */
export function requestedVersion(raw: string | string[] | undefined): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || !/^\d{1,4}$/.test(value)) return null;
  return Number(value);
}

/** Page légale publique : texte en vigueur (ou version archivée), date, liste des versions. */
export async function LegalPageView({ slug, locale, version }: { slug: LegalSlug; locale: string; version: number | null }) {
  const [t, format, { doc, versions }, isAdmin] = await Promise.all([
    getTranslations("legal"),
    getFormatter(),
    getLegalDocument(slug, locale, version),
    slug === "cookies" ? getAdmin().then(Boolean) : false,
  ]);

  return (
    <PageShell>
      <SectionTitle level={1} kanji={KANJI[slug]} title={doc?.title ?? t(`titles.${slug}`)} />
      {doc ? (
        <>
          <p className="text-sm text-text-muted">
            {doc.publishedAt
              ? t("versionPublished", { version: doc.version, date: format.dateTime(doc.publishedAt, { dateStyle: "long" }) })
              : t("version", { version: doc.version })}
            {doc.version !== versions[0] && (
              <>
                {" · "}
                <Link href={`/${slug}`} className="font-medium text-ai underline underline-offset-4">
                  {t("currentVersion")}
                </Link>
              </>
            )}
          </p>
          {doc.fallback && (
            <p lang="en" className="lacquer rounded-card p-3 text-sm text-text-muted">
              {t("fallbackNotice")}
            </p>
          )}
          <article lang={doc.locale}>
            <LegalMarkdown body={doc.body} />
          </article>
        </>
      ) : (
        <p className="text-text-muted">{t("missing")}</p>
      )}

      {slug === "mentions-legales" && (
        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-xl font-extrabold">{t("followTitle")}</h2>
          <p className="text-sm text-text-muted">{t("followText")}</p>
          <XFollowLink variant="button" />
        </section>
      )}

      {slug === "cookies" && (
        <section className="flex flex-col gap-3">
          {/* La liste détaillée n'est montrée qu'aux admins, pour contrôle */}
          {isAdmin && (
            <>
              <h2 className="font-heading text-xl font-extrabold">{t("cookieTableTitle")}</h2>
              <CookieTable />
            </>
          )}
          <ManageCookiesButton className="self-start" />
        </section>
      )}

      {versions.length > 1 && (
        <nav aria-label={t("versionsLabel")} className="flex flex-col gap-2 text-sm">
          <h2 className="font-bold">{t("versionsLabel")}</h2>
          <ul className="flex flex-wrap gap-2">
            {versions.map((v) => (
              <li key={v}>
                <Link
                  href={v === versions[0] ? `/${slug}` : `/${slug}?v=${v}`}
                  aria-current={doc?.version === v ? "page" : undefined}
                  className="inline-flex min-h-11 items-center rounded-control border border-border bg-surface-2 px-3 aria-[current=page]:border-shu aria-[current=page]:text-shu"
                >
                  {t("versionShort", { version: v })}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </PageShell>
  );
}

/** Métadonnées communes : titre traduit, indexable seulement pour la version en vigueur. */
export async function legalMetadata(slug: LegalSlug, locale: string, version: number | null) {
  const current = hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
  const t = await getTranslations({ locale: current, namespace: "legal" });
  return {
    title: t(`titles.${slug}`),
    alternates: localeAlternates(`/${slug}`, current),
    robots: version ? { index: false, follow: true } : undefined,
  };
}
