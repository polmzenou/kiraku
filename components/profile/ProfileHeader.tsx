import { useFormatter, useTranslations } from "next-intl";
import Image from "next/image";
import { SealMark } from "@/components/SealMark";
import { guestCode } from "@/lib/username";

/** En-tête du profil : avatar ou sceau, pseudo (« Invité-XXXX » pour un invité), date d'arrivée. */
export function ProfileHeader({
  username,
  image,
  isGuest,
  createdAt,
}: {
  username: string;
  image: string | null;
  isGuest: boolean;
  createdAt?: Date;
}) {
  const t = useTranslations("profile");
  const tAccount = useTranslations("account");
  const format = useFormatter();
  const code = guestCode(username);
  const name = isGuest && code ? tAccount("guestName", { code }) : username;

  return (
    <header className="flex items-center gap-4">
      {image ? (
        <Image src={image} alt={tAccount("avatarAlt", { name })} width={64} height={64} className="rounded-full" />
      ) : (
        <SealMark glyphs="札" size={64} />
      )}
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="truncate font-title text-2xl font-extrabold md:text-3xl">{name}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm text-text-muted">
          {isGuest && <span className="rounded-sm border border-border px-2 text-xs">{tAccount("guestBadge")}</span>}
          {createdAt && <span>{t("since", { date: format.dateTime(createdAt, { month: "long", year: "numeric" }) })}</span>}
        </div>
      </div>
    </header>
  );
}

/** Nom affiché d'un joueur, pour les titres de page. */
export function displayName(username: string, isGuest: boolean, guestLabel: (code: string) => string) {
  const code = guestCode(username);
  return isGuest && code ? guestLabel(code) : username;
}
