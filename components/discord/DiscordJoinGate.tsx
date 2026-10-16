import { getLocale } from "next-intl/server";
import { localize } from "@/lib/boosters/types";
import { joinModalEligible } from "@/lib/discord/join-modal";
import { prisma } from "@/server/db";
import { getSetting } from "@/server/settings";
import { getCurrentUser } from "@/server/user";
import { DiscordJoinModal } from "./DiscordJoinModal";

/** Décide côté serveur si le modal Discord peut s'afficher ; rien n'est envoyé au client sinon. */
export async function DiscordJoinGate() {
  const config = await getSetting("discord.joinModal");
  if (!config.enabled || !config.inviteUrl) return null;
  const user = await getCurrentUser();
  if (!user || user.discordJoinedAt) return null;

  const boostersOpened =
    config.trigger === "AFTER_BOOSTERS"
      ? await prisma.boosterOpening.count({ where: { userId: user.id }, take: config.afterBoosters })
      : 0;
  if (!joinModalEligible(config, { discordJoinedAt: user.discordJoinedAt, boostersOpened })) return null;

  const locale = await getLocale();
  return (
    <DiscordJoinModal
      title={localize(config.title, locale)}
      body={localize(config.body, locale)}
      inviteUrl={config.inviteUrl}
      cooldownDays={config.cooldownDays}
    />
  );
}
