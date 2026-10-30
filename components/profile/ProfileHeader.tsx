import { useFormatter, useTranslations } from "next-intl";
import Image from "next/image";
import { SealMark } from "@/components/SealMark";
import { guestCode } from "@/lib/username";
import type { Badge } from "@/lib/profile/badges";
import type { PlayerDecor } from "@/lib/profile/decor";
import { offlineFor, type Presence } from "@/lib/social/presence";
import { PlayerName } from "../social/PlayerName";
import { WithPresence } from "../social/PresenceDot";
import { AvatarFrame } from "./AvatarFrame";
import { BadgeRow } from "./ProfileCustomizeSheet";

/** Ce que le joueur a choisi d'afficher (étape 12h). */
export type HeaderDecor = PlayerDecor & { bio: string | null; title: string | null; badges: Badge[] };

/**
 * En-tête du profil : avatar ou sceau (dans son cadre), pseudo dans sa couleur (« Invité-XXXX » pour un invité),
 * titre, badges, présence (pastille, « En ligne » ou « Déconnecté depuis… »), date d'arrivée et bio.
 */
export function ProfileHeader({
  username,
  image,
  isGuest,
  createdAt,
  decor,
  presence,
  action,
}: {
  username: string;
  image: string | null;
  isGuest: boolean;
  createdAt?: Date;
  decor?: HeaderDecor;
  /** Absente quand le visiteur ne voit pas le profil (même règle que sa visibilité) ou pour un invité. */
  presence?: Presence;
  /** Bouton « Personnaliser » sur son propre profil. */
  action?: React.ReactNode;
}) {
  const t = useTranslations("profile");
  const tAccount = useTranslations("account");
  const format = useFormatter();
  const code = guestCode(username);
  const name = isGuest && code ? tAccount("guestName", { code }) : username;
  const tPresence = useTranslations("presence");
  const away = presence && !presence.online && presence.lastSeenAt ? offlineFor(presence.lastSeenAt, new Date()) : null;

  return (
    <header className="flex flex-col gap-3">
      <div className="flex items-center gap-4">
        <WithPresence online={presence?.online} size={64} announce={false}>
          <AvatarFrame frame={decor?.frame ?? null} size={64}>
            {image ? (
              <Image src={image} alt={tAccount("avatarAlt", { name })} width={64} height={64} crossOrigin="anonymous" referrerPolicy="no-referrer" className="rounded-full" />
            ) : (
              <SealMark glyphs="札" size={64} />
            )}
          </AvatarFrame>
        </WithPresence>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="truncate font-heading text-2xl font-extrabold md:text-3xl">
            <PlayerName name={name} color={decor?.nameColor} className="truncate" />
          </h1>
          {decor?.title && <p className="text-sm font-bold text-kin">{decor.title}</p>}
          <div className="flex flex-wrap items-center gap-2 text-sm text-text-muted">
            {isGuest && <span className="rounded-sm border border-border px-2 text-xs">{tAccount("guestBadge")}</span>}
            {presence?.online && <span className="font-bold text-hisui">{tPresence("online")}</span>}
            {away && (
              <span>
                {away.unit === "minutes"
                  ? tPresence("offlineMinutes", { count: away.count })
                  : away.unit === "hours"
                    ? tPresence("offlineHours", { count: away.count })
                    : tPresence("offlineDays", { count: away.count })}
              </span>
            )}
            {createdAt && <span>{t("since", { date: format.dateTime(createdAt, { month: "long", year: "numeric" }) })}</span>}
          </div>
          {decor && decor.badges.length > 0 && <BadgeRow badges={decor.badges} />}
        </div>
        {action && <div className="hidden shrink-0 sm:block">{action}</div>}
      </div>
      {decor?.bio && <p className="max-w-prose text-sm break-words whitespace-pre-wrap">{decor.bio}</p>}
      {action && <div className="sm:hidden">{action}</div>}
    </header>
  );
}

/** Nom affiché d'un joueur, pour les titres de page. */
export function displayName(username: string, isGuest: boolean, guestLabel: (code: string) => string) {
  const code = guestCode(username);
  return isGuest && code ? guestLabel(code) : username;
}
