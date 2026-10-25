import { notFound } from "next/navigation";
import { requireAdmin } from "@/server/admin";
import { catalogEditorContext, catalogEditorDraft, catalogEditorOptions } from "@/server/catalog/admin-queries";
import { CardEditor } from "@/components/admin/catalog/CardEditor";
import { CardOwners } from "@/components/admin/catalog/CardOwners";

export default async function EditCardPage({ params }: PageProps<"/[locale]/admin/catalogue/[id]">) {
  await requireAdmin(); const { id } = await params;
  const [options, initial] = await Promise.all([catalogEditorOptions(), catalogEditorDraft(id)]);
  if (!initial) notFound();
  return <div className="flex flex-col gap-6">
    <CardEditor key={id} initial={initial} options={options} context={await catalogEditorContext(initial)} />
    <CardOwners cardId={id} />
  </div>;
}
