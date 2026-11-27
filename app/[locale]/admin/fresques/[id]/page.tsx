import { getLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { FrescoEditor } from "@/components/admin/fresco/FrescoEditor";
import { requireAdmin } from "@/server/admin";
import { lotViews } from "@/server/economy/lot-view";
import { frescoEditorOptions, getFrescoAdmin } from "@/server/fresco/admin-queries";

/** Éditeur d'une fresque, avec l'aperçu en direct des écrans des joueurs. */
export default async function AdminFrescoPage({ params }: PageProps<"/[locale]/admin/fresques/[id]">) {
  await requireAdmin();
  const [{ id }, locale] = await Promise.all([params, getLocale()]);
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) notFound();
  const [detail, options] = await Promise.all([getFrescoAdmin(id), frescoEditorOptions(locale)]);
  if (!detail) notFound();
  // Contenu des lots, pour les montrer dans l'aperçu tels que les joueurs les verront
  const views = await lotViews(
    options.lots.map((l) => l.id),
    locale,
  );
  return (
    <FrescoEditor
      key={`${detail.id}-${detail.imageUrl ?? "none"}-${detail.status}`}
      detail={{ ...detail, publishedAt: detail.publishedAt?.toISOString() ?? null }}
      options={options}
      lotViews={Object.fromEntries(views)}
      storageConfigured={Boolean(process.env.BLOB_READ_WRITE_TOKEN && process.env.BLOB_PUBLIC_HOST)}
    />
  );
}
