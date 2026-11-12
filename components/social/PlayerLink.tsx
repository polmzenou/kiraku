import { Link } from "@/i18n/navigation";
import type { ShownPlayer } from "@/lib/social/shown-player";
import { PlayerAvatar } from "./PlayerAvatar";
import { PlayerName } from "./PlayerName";
import { PrivateNameLock } from "./PrivateNameLock";

/**
 * Avatar et pseudo d'un joueur, menant à son profil. Sans lien quand son identité reste cachée au lecteur ;
 * un admin y lit le pseudo caché, suivi d'un cadenas.
 */
export function PlayerLink({ player, size = 28 }: { player: ShownPlayer; size?: number }) {
  const className = "inline-flex min-h-11 max-w-full min-w-0 items-center gap-1.5 align-middle";
  const content = (
    <>
      <PlayerAvatar username={player.name} image={player.image} size={size} frame={player.frame} />
      <PlayerName name={player.name} color={player.color} className="min-w-0 truncate font-bold" />
      {player.locked && <PrivateNameLock />}
    </>
  );
  if (!player.profile) return <span className={className}>{content}</span>;
  return (
    <Link href={`/u/${player.profile}`} className={`${className} underline-offset-2 hover:underline`}>
      {content}
    </Link>
  );
}

/** Balise de t.rich qui place le joueur dans une phrase (« Mise en vente par <player>{name}</player> »). */
export function playerLinkTag(player: ShownPlayer, size?: number) {
  function PlayerLinkTag() {
    return <PlayerLink player={player} size={size} />;
  }
  return PlayerLinkTag;
}
