"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { JOIN_LATER_KEY, laterCooldownOver } from "@/lib/discord/join-modal";
import { joinDiscordAction } from "@/server/actions/discord";
import { buttonClasses } from "../ui/Button";
import { Sheet } from "../ui/Sheet";

function readLaterAt(): number | null {
  try {
    const raw = window.localStorage.getItem(JOIN_LATER_KEY);
    return raw === null ? null : Number(raw);
  } catch {
    return null;
  }
}

/**
 * « Rejoins notre Discord » : rendu seulement pour un joueur éligible (décidé par le serveur) ; le
 * délai après « Plus tard » est gardé dans le navigateur. « Rejoindre » ouvre l'invitation dans un
 * nouvel onglet et l'enregistre sur le compte : le modal ne revient plus.
 */
export function DiscordJoinModal({
  title,
  body,
  inviteUrl,
  cooldownDays,
}: {
  title: string;
  body: string;
  inviteUrl: string;
  cooldownDays: number;
}) {
  const t = useTranslations("discordJoin");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Après l'hydratation, et un peu plus tard : on ne coupe pas l'arrivée sur la page
    const timer = window.setTimeout(() => {
      if (laterCooldownOver(readLaterAt(), cooldownDays, Date.now())) setOpen(true);
    }, 1_500);
    return () => window.clearTimeout(timer);
  }, [cooldownDays]);

  function later() {
    try {
      window.localStorage.setItem(JOIN_LATER_KEY, String(Date.now()));
    } catch {
      // Stockage indisponible : le modal reviendra à la prochaine visite
    }
    setOpen(false);
  }

  return (
    <Sheet open={open} onClose={later} title={title}>
      <div className="flex items-start gap-3">
        <span aria-hidden="true" lang="ja" className="font-seal text-3xl text-ai">
          集
        </span>
        <p className="text-sm">{body}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={later} className={buttonClasses("neutral")}>
          {t("later")}
        </button>
        <a
          href={inviteUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => {
            void joinDiscordAction();
            setOpen(false);
          }}
          className={buttonClasses("shu")}
        >
          {t("join")}
        </a>
      </div>
    </Sheet>
  );
}
