import { needsReleaseWelcome } from "@/lib/welcome/release";
import { getSetting } from "@/server/settings";
import { requireActiveUser } from "@/server/user";
import { DiscordJoinGate } from "../discord/DiscordJoinGate";
import { V1WelcomeModal } from "./V1WelcomeModal";

/** La présentation de la dernière version a priorité : pas de deuxième modal Discord par-dessus. */
export async function PlayerAnnouncements() {
  const user = await requireActiveUser();
  if (!user) return null;
  if (!needsReleaseWelcome(user.v1WelcomeSeenAt)) return <DiscordJoinGate />;

  const [discordBonus, discord] = await Promise.all([getSetting("discord.linkBonusZeni"), getSetting("discord.joinModal")]);
  return (
    <V1WelcomeModal
      key={user.id}
      userId={user.id}
      username={user.username}
      discordBonus={discordBonus}
      contactUrl={discord.enabled && discord.inviteUrl ? discord.inviteUrl : null}
    />
  );
}
