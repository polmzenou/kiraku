import { getTranslations } from "next-intl/server";
import { RelationActions } from "@/components/social/RelationActions";
import { ButtonLink } from "@/components/ui/ButtonLink";
import type { ProfileAccess } from "@/lib/collection/visibility";
import type { Relation } from "@/lib/social/relation";
import { tradeOfferable } from "@/lib/social/trades";
import type { loadProfile } from "@/server/collection/profile-page";
import { getSealedDrops } from "@/server/economy/queries";
import { getSetting } from "@/server/settings";
import { giftsSentToday } from "@/server/social/queries";

// Barre des relations d'un profil (ami, cadeau, échange), sur le profil et sur la page d'une vitrine.

/**
 * Barre sociale du profil d'un autre joueur : relation et cadeaux pour un compte inscrit, invitation
 * à s'inscrire pour un invité, rien pour son propre profil ni pour le profil d'un invité.
 */
export async function profileSocialBar({
  owner,
  viewer,
  access,
  name,
}: {
  owner: { id: string; username: string; isGuest: boolean };
  viewer: Awaited<ReturnType<typeof loadProfile>>["viewer"];
  access: ProfileAccess & { relation: Relation | null };
  name: string;
}) {
  if (!viewer || access.isOwner || owner.isGuest || !access.relation) return null;
  if (!(await getSetting("social.enabled"))) return null;
  const t = await getTranslations("friends");
  if (viewer.isGuest) {
    return (
      <p className="flex flex-wrap items-center gap-2 text-sm text-text-muted">
        {t("guestOnlyShort", { name })}
        <ButtonLink href="/inscription">{t("signUp")}</ButtonLink>
      </p>
    );
  }
  if (viewer.bannedAt) return null;

  let gift = null;
  if (access.relation === "FRIENDS" && (await getSetting("gifts.enabled"))) {
    const [price, perDaySent, perDayReceived, minAccountAgeHours, minFriendshipHours, timeZone, allowedRarities, sealedMinAccountDays, sealedPerWeek] = await Promise.all([
      getSetting("gifts.boosterPriceZeni"),
      getSetting("gifts.perDaySent"),
      getSetting("gifts.perDayReceived"),
      getSetting("gifts.minAccountAgeHours"),
      getSetting("gifts.minFriendshipHours"),
      getSetting("game.timeZone"),
      getSetting("gifts.allowedRarities"),
      getSetting("gifts.sealedMinAccountDays"),
      getSetting("gifts.sealedPerWeek"),
    ]);
    const [sent, sealed] = await Promise.all([giftsSentToday(viewer.id, owner.id, timeZone), getSealedDrops(viewer.id)]);
    gift = {
      price,
      coins: viewer.coins,
      remaining: Math.max(0, perDaySent - sent),
      limits: { perDaySent, perDayReceived, minAccountAgeHours, minFriendshipHours, sealedMinAccountDays, sealedPerWeek },
      allowedRarities,
      sealed: sealed.filter((s) => s.giftable).map((s) => ({ id: s.id, kind: s.kind })),
    };
  }
  // Entre amis toujours ; hors amis si le réglage l'ouvre et que la collection est visible (même règle qu'à l'envoi)
  const canTrade = tradeOfferable(access.relation, access.collection, await getSetting("trades.nonFriends"));
  const trade =
    canTrade && (await getSetting("trades.enabled"))
      ? { maxOffered: await getSetting("trades.maxOffered"), allowedRarities: await getSetting("trades.allowedRarities") }
      : null;
  return <RelationActions username={owner.username} name={name} initial={access.relation} gift={gift} trade={trade} />;
}
