import { getTranslations } from "next-intl/server";
import { WishlistToggle } from "../profile/WishlistToggle";
import { prisma } from "@/server/db";
import { getCurrentUser } from "@/server/user";

export async function WikiWishlistAction({ cardId, name }: { cardId: string; name: string }) {
  const user = await getCurrentUser();
  if (!user || user.bannedAt) return null;
  const [entry, owned] = await Promise.all([
    prisma.wishlistEntry.findUnique({ where: { userId_cardId: { userId: user.id, cardId } }, select: { cardId: true } }),
    prisma.userCard.count({ where: { ownerId: user.id, cardId } }),
  ]);
  // Une carte possédée ne s'ajoute pas ; si elle y est encore, on laisse la retirer
  if (owned > 0 && !entry) {
    const t = await getTranslations("wishlist");
    return <p className="text-sm text-text-muted">{t("owned")}</p>;
  }
  return <WishlistToggle cardId={cardId} name={name} initial={Boolean(entry)} />;
}
