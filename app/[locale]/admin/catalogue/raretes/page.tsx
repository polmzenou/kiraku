import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/server/admin";
import { getRarityDefinitions } from "@/server/catalog/rarities";
import { rarityEditorDraft } from "@/server/catalog/admin-queries";
import { RarityEditor } from "@/components/admin/catalog/RarityEditor";
import { Link } from "@/i18n/navigation";

export default async function RaritiesPage({ searchParams }: PageProps<"/[locale]/admin/catalogue/raretes">) {
  await requireAdmin(); const raw = await searchParams;
  const [t, definitions] = await Promise.all([getTranslations("admin.catalog"), getRarityDefinitions()]);
  const key = typeof raw.key === "string" && definitions.some((r) => r.key === raw.key) ? raw.key : null;
  const [initial, templates] = await Promise.all([rarityEditorDraft(key), Promise.all(definitions.map((r) => rarityEditorDraft(r.key)))]);
  return <div className="grid gap-5"><Link href="/admin/catalogue" className="text-sm text-link underline">{t("back")}</Link><h2 className="font-heading text-3xl font-bold">{t("manageRarities")}</h2><nav aria-label={t("rarity")} className="flex flex-wrap gap-2"><Link href="/admin/catalogue/raretes" className="inline-flex min-h-11 items-center rounded-control border border-border px-3 text-sm">+ {t("newRarity")}</Link>{definitions.map((r) => <Link key={r.key} href={`/admin/catalogue/raretes?key=${r.key}`} className="inline-flex min-h-11 items-center gap-2 rounded-control border border-border px-3 text-sm" aria-current={r.key === key ? "page" : undefined}><span>{r.seal}</span>{r.nameFr}</Link>)}</nav><RarityEditor key={key ?? "new"} initial={initial} templates={templates} /></div>;
}
