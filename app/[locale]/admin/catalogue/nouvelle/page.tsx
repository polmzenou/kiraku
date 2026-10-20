import { notFound } from "next/navigation";
import { requireAdmin } from "@/server/admin";
import { blankCard } from "@/lib/catalog/admin-form";
import { catalogEditorContext, catalogEditorDraft, catalogEditorOptions, catalogVariantDraft } from "@/server/catalog/admin-queries";
import { CardEditor } from "@/components/admin/catalog/CardEditor";

export default async function NewCardPage({ searchParams }: PageProps<"/[locale]/admin/catalogue/nouvelle">) {
  await requireAdmin(); const raw = await searchParams;
  const one = (key: string) => typeof raw[key] === "string" ? raw[key].slice(0, 64) : null;
  const duplicate = one("duplicate"), variantOf = one("variantOf"), rarity = one("rarity");
  const [options, initial] = await Promise.all([catalogEditorOptions(),
    variantOf && rarity ? catalogVariantDraft(variantOf, rarity) : duplicate ? catalogEditorDraft(duplicate, true) : blankCard()]);
  if (!initial) notFound();
  return <CardEditor key={`${variantOf ?? duplicate ?? "new"}:${rarity ?? ""}`} initial={initial} options={options} context={await catalogEditorContext(initial)} />;
}
