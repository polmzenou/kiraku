import { getTranslations } from "next-intl/server";
import { UniverseManager, type UniverseRow } from "@/components/admin/UniverseManager";
import { inputClass } from "@/components/admin/fields";
import { buttonClasses } from "@/components/ui/Button";
import { Link } from "@/i18n/navigation";
import type { Prisma } from "@/generated/prisma/client";
import { requireAdmin } from "@/server/admin";
import { prisma } from "@/server/db";

const PER_PAGE = 40;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Univers de séries : regroupés par `npm run catalog:universes`, corrigés ici. Les plus gros d'abord. */
export default async function AdminUniversesPage({ searchParams }: PageProps<"/[locale]/admin/univers">) {
  await requireAdmin();
  const sp = await searchParams;
  const q = (one(sp.q) ?? "").trim().slice(0, 100);
  const page = Math.max(1, Math.floor(Number(one(sp.page))) || 1);
  const contains = { contains: q, mode: "insensitive" } as const;
  const where: Prisma.UniverseWhereInput = q
    ? { OR: [{ name: contains }, { series: { some: { OR: [{ titleRomaji: contains }, { titleEnglish: contains }] } } }] }
    : {};

  const [t, total, rows, targets] = await Promise.all([
    getTranslations("admin.universes"),
    prisma.universe.count({ where }),
    prisma.universe.findMany({
      where,
      orderBy: [{ series: { _count: "desc" } }, { name: "asc" }, { id: "asc" }],
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      select: {
        id: true,
        name: true,
        series: { orderBy: { titleRomaji: "asc" }, select: { id: true, titleRomaji: true, _count: { select: { cards: true } } } },
      },
    }),
    prisma.universe.findMany({ orderBy: [{ name: "asc" }, { id: "asc" }], select: { id: true, name: true } }),
  ]);
  const universes: UniverseRow[] = rows.map((u) => ({
    id: u.id,
    name: u.name,
    series: u.series.map((s) => ({ id: s.id, title: s.titleRomaji, cards: s._count.cards })),
  }));
  const pages = Math.ceil(total / PER_PAGE);
  const pageHref = (n: number) => ({ pathname: "/admin/univers", query: { ...(q ? { q } : {}), ...(n > 1 ? { page: n } : {}) } });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-2xl font-bold">{t("title")}</h2>
        <p className="max-w-prose text-sm text-text-muted">{t("intro")}</p>
      </div>

      <form role="search" className="flex gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">{t("search")}</span>
          <input type="search" name="q" defaultValue={q} placeholder={t("search")} className={inputClass} />
        </label>
        <button type="submit" className={buttonClasses("secondary")}>
          {t("searchSubmit")}
        </button>
      </form>

      <p className="text-sm tabular-nums text-text-muted">{t("total", { count: total })}</p>
      <UniverseManager universes={universes} targets={targets} />

      {pages > 1 && (
        <nav aria-label={t("pagination")} className="flex items-center justify-between gap-3">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className={buttonClasses("secondary")}>
              {t("previous")}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm tabular-nums text-text-muted">{t("pageOf", { page, pages })}</span>
          {page < pages ? (
            <Link href={pageHref(page + 1)} className={buttonClasses("secondary")}>
              {t("next")}
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
