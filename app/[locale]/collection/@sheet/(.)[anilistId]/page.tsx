import { z } from "zod";
import { CardDetail } from "@/components/collection/CardDetail";
import { CardSheet } from "@/components/collection/CardSheet";
import { getCatalogCard } from "@/server/catalog/queries";
import { getCurrentUser } from "@/server/user";

const idSchema = z.coerce.number().int().positive().max(2_147_483_647);

/** Fiche carte en feuille, au-dessus de la liste (navigation depuis /collection). */
export default async function CollectionCardSheet({ params }: PageProps<"/[locale]/collection/[anilistId]">) {
  const { anilistId } = await params;
  const id = idSchema.safeParse(anilistId);
  const [user, card] = await Promise.all([getCurrentUser(), id.success ? getCatalogCard(id.data) : null]);
  if (!card || !user) return null;

  return (
    <CardSheet title={card.name}>
      <CardDetail card={card} ownerId={user.id} username={user.username} headingLevel={2} />
    </CardSheet>
  );
}
