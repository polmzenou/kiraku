import { isFrozen } from "@/lib/account/deletion";
import type { Rarity } from "@/lib/catalog/rarity";
import { cardViews } from "@/server/boosters/display";
import { getCardOwners } from "@/server/catalog/card-owners";
import { getSetting } from "@/server/settings";
import { getCurrentUser } from "@/server/user";
import { WikiCardOwnersList, type OwnersBlock } from "./WikiCardOwnersList";

export { WikiCardOwnersSkeleton } from "./WikiCardOwnersList";

/**
 * « Ils possèdent cette carte » : amis d'un côté, autres joueurs de l'autre, avec un bouton pour
 * demander l'échange. Personnel au lecteur, rendu sous Suspense hors de la fiche mise en cache.
 * Le serveur revérifie tout à l'envoi (server/actions/trades.ts).
 */
export async function WikiCardOwners({ cardId, rarity, name, locale }: { cardId: string; rarity: Rarity; name: string; locale: string }) {
  const user = await getCurrentUser();
  const viewer = user && !user.bannedAt && !isFrozen(user) ? user : null;
  const [socialEnabled, tradesEnabled, nonFriends, allowedRarities, maxOffered, owners, views] = await Promise.all([
    getSetting("social.enabled"),
    getSetting("trades.enabled"),
    getSetting("trades.nonFriends"),
    getSetting("trades.allowedRarities"),
    getSetting("trades.maxOffered"),
    getCardOwners(viewer?.id ?? null, cardId),
    cardViews([cardId], locale),
  ]);
  const card = views.get(cardId);
  if (!card) return null;

  const block: OwnersBlock = !viewer || viewer.isGuest
    ? "guest"
    : !socialEnabled || !tradesEnabled
      ? "closed"
      : !allowedRarities.includes(rarity)
        ? "rarity"
        : null;

  return (
    <WikiCardOwnersList
      name={name}
      card={card}
      friends={owners.friends}
      others={owners.others}
      othersTotal={owners.othersTotal}
      showFriends={viewer !== null && !viewer.isGuest}
      block={block}
      othersBlocked={!nonFriends}
      maxOffered={maxOffered}
      allowedRarities={allowedRarities}
    />
  );
}
