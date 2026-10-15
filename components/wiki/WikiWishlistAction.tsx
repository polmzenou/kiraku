import { WishlistToggle } from "../profile/WishlistToggle";
import { prisma } from "@/server/db";
import { getCurrentUser } from "@/server/user";

export async function WikiWishlistAction({ cardId, name }: { cardId: string; name: string }) {
  const user = await getCurrentUser();
  if (!user || user.bannedAt) return null;
  const entry = await prisma.wishlistEntry.findUnique({ where: { userId_cardId: { userId: user.id, cardId } }, select: { cardId: true } });
  return <WishlistToggle cardId={cardId} name={name} initial={Boolean(entry)} />;
}
