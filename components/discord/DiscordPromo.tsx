import { getLocale } from "next-intl/server";
import { localize } from "@/lib/boosters/types";
import { socialPromoVisible } from "@/lib/discord/social-promo";
import { getSetting } from "@/server/settings";
import { DiscordPromoJoin } from "./DiscordPromoJoin";

/**
 * Section « Rejoins notre Discord » de la page Social : rendue seulement si l'admin l'a activée et
 * qu'on est dans sa fenêtre d'affichage (comparée à l'heure du rendu, jamais mise en cache).
 */
export async function DiscordPromo({ member }: { member: boolean }) {
  const config = await getSetting("discord.socialPromo");
  if (!socialPromoVisible(config, new Date())) return null;
  const locale = await getLocale();
  const title = localize(config.title, locale);
  return (
    <section aria-label={title} className="flex flex-col gap-3 rounded-card border border-ai/40 bg-surface p-4 sm:flex-row sm:items-center sm:gap-4">
      <span aria-hidden="true" lang="ja" className="font-seal text-4xl text-ai">
        集
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 className="font-title text-lg font-bold">{title}</h2>
        <p className="text-sm text-text-muted">{localize(config.body, locale)}</p>
      </div>
      <DiscordPromoJoin inviteUrl={config.inviteUrl} track={member} />
    </section>
  );
}
