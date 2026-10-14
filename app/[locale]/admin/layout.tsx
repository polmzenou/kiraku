import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageShell } from "@/components/PageShell";
import { SectionTitle } from "@/components/SectionTitle";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/server/admin";

export const metadata: Metadata = { robots: { index: false, follow: false } };

const MODULES = [
  { key: "boosters", href: "/admin/boosters", ready: true },
  { key: "types", href: "/admin/boosters/types", ready: true },
  { key: "banners", href: "/admin/bannieres", ready: true },
  { key: "collection", href: "/admin/collection", ready: true },
  { key: "social", href: "/admin/social", ready: true },
  { key: "users", href: "/admin/utilisateurs", ready: false },
  { key: "catalog", href: "/admin/catalogue", ready: false },
  { key: "market", href: "/admin/marche", ready: false },
  { key: "ranked", href: "/admin/classe", ready: false },
] as const;

/** Toute la section /admin : rôle vérifié côté serveur (404 sinon), chaque action le revérifie. */
export default async function AdminLayout({ children }: LayoutProps<"/[locale]/admin">) {
  await requireAdmin();
  const t = await getTranslations("admin");

  return (
    <PageShell>
      <SectionTitle level={1} kanji="管理" title={t("title")} />
      <nav aria-label={t("modules")}>
        <ul className="flex flex-wrap gap-2">
          {MODULES.map((m) =>
            m.ready ? (
              <li key={m.key}>
                <Link
                  href={m.href}
                  className="inline-flex min-h-11 items-center rounded-button border border-border bg-surface-2 px-3 text-sm font-bold"
                >
                  {t(`moduleNames.${m.key}`)}
                </Link>
              </li>
            ) : (
              <li key={m.key}>
                <span
                  aria-disabled="true"
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-button border border-border px-3 text-sm text-text-muted"
                >
                  {t(`moduleNames.${m.key}`)}
                  <span className="text-[10px] uppercase">{t("soon")}</span>
                </span>
              </li>
            ),
          )}
        </ul>
      </nav>
      {children}
    </PageShell>
  );
}
