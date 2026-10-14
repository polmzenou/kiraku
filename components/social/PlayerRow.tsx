import { useTranslations } from "next-intl";
import Image from "next/image";
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { displayName } from "../profile/ProfileHeader";

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
    <li className="flex min-h-16 items-center gap-3 border-b border-border py-2 last:border-b-0">
      <Link href={`/u/${player.username}`} className="flex min-h-11 min-w-0 flex-1 items-center gap-3">
        {player.image ? (
          <Image src={player.image} alt="" width={40} height={40} className="size-10 shrink-0 rounded-full" />
        ) : (
          <span
            aria-hidden="true"
            className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 font-title font-bold"
          >
            {player.username.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-bold">{name}</span>
          {detail && <span className="truncate text-xs text-text-muted">{detail}</span>}
        </span>
      </Link>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </li>
  );
}
