"use client";

import { useTranslations } from "next-intl";
import { joinDiscordAction } from "@/server/actions/discord";
import { buttonClasses } from "../ui/Button";

/** « Rejoindre » : ouvre l'invitation dans un nouvel onglet et, pour un compte, l'enregistre (comme le modal). */
export function DiscordPromoJoin({ inviteUrl, track }: { inviteUrl: string; track: boolean }) {
  const t = useTranslations("discordJoin");
  return (
    <a
      href={inviteUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => {
        if (track) void joinDiscordAction();
      }}
      className={buttonClasses("primary", "shrink-0 self-start sm:self-center")}
    >
      {t("join")}
    </a>
  );
}
