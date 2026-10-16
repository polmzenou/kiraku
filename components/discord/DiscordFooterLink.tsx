import { getTranslations } from "next-intl/server";
import { getSetting } from "@/server/settings";

/** Lien « Notre Discord » du pied de page, si l'admin l'a activé avec un lien d'invitation. */
export async function DiscordFooterLink() {
  const config = await getSetting("discord.joinModal");
  if (!config.enabled || !config.showInFooter || !config.inviteUrl) return null;
  const t = await getTranslations("discordJoin");
  return (
    <li>
      <a
        href={config.inviteUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center py-2 underline-offset-4 transition-colors hover:text-text hover:underline"
      >
        {t("footer")}
      </a>
    </li>
  );
}
