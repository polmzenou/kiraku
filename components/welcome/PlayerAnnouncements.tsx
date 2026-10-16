import { getSetting } from "@/server/settings";
import { requireActiveUser } from "@/server/user";
import { DiscordJoinGate } from "../discord/DiscordJoinGate";
import { V1WelcomeModal } from "./V1WelcomeModal";

/** La présentation de la v1 a priorité : pas de deuxième modal Discord par-dessus. */
export async function PlayerAnnouncements() {
  const user = await requireActiveUser();
  if (!user) return null;
  if (user.v1WelcomeSeenAt) return <DiscordJoinGate />;

  return <V1WelcomeModal key={user.id} userId={user.id} discordBonus={await getSetting("discord.linkBonusZeni")} />;
}
