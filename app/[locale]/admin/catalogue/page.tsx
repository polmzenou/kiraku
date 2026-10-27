import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireStaff } from "@/server/admin";
import { adminCatalogList } from "@/server/catalog/admin-queries";
import { getRarityDefinitions } from "@/server/catalog/rarities";
import { prisma } from "@/server/db";
import { CatalogList } from "@/components/admin/catalog/CatalogList";

export default async function AdminCatalogPage({ searchParams }: PageProps<"/[locale]/admin/catalogue">) {
  const { scope } = await requireStaff();
  const [t, data, rarities, boosters] = await Promise.all([getTranslations("admin.catalog"), adminCatalogList(await searchParams), getRarityDefinitions(),
    prisma.boosterType.findMany({ orderBy: [{ family: "asc" }, { sortOrder: "asc" }], select: { id: true, slug: true, name: true } })]);
  const series = data.filters.series ? await prisma.series.findUnique({ where: { id: data.filters.series }, select: { id: true, titleRomaji: true } }) : null;
  const control = "min-h-11 min-w-0 rounded-control border border-border bg-surface px-3 text-sm";
  return <div className="flex min-w-0 flex-col gap-5">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-heading text-3xl font-bold">{t("title")}</h2><p className="mt-2 text-sm text-text-muted">{t("intro")}</p></div><div className="flex gap-2">{scope === "full" && <Link href="/admin/catalogue/raretes" className={`${control} inline-flex items-center`}>{t("manageRarities")}</Link>}<Link href="/admin/catalogue/nouvelle" className={`${control} inline-flex items-center bg-shu-btn font-bold text-white`}>{t("create")}</Link></div></header>
    <CatalogList scope={scope} data={data} rarities={rarities} boosters={boosters} series={series ? { id: series.id, label: series.titleRomaji } : null} />
  </div>;
}
