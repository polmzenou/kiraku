import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { displayName } from "../profile/ProfileHeader";
import { PlayerAvatar } from "./PlayerAvatar";

/** Ligne d'un joueur dans les listes sociales : avatar, pseudo (lien vers son profil), actions. */
export function PlayerRow({
  player,
  detail,
  children,
}: {
  player: { username: string; image: string | null; isGuest: boolean };
  detail?: ReactNode;
  children?: ReactNode;
}) {
  const tAccount = useTranslations("account");
  const name = displayName(player.username, player.isGuest, (code) => tAccount("guestName", { code }));
  return (
    <li className="flex min-h-16 items-center gap-3 rounded-control px-2 py-2 transition-colors hover:bg-surface-2/60">
      <Link href={`/u/${player.username}`} className="flex min-h-11 min-w-0 flex-1 items-center gap-3">
        <PlayerAvatar username={player.username} image={player.image} size={40} />
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-bold">{name}</span>
          {detail && <span className="truncate text-xs text-text-muted">{detail}</span>}
        </span>
      </Link>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </li>
  );
}
