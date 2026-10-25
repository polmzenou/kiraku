import { needsReleaseWelcome } from "@/lib/welcome/release";
import { requireActiveUser } from "@/server/user";
import { DiscordJoinGate } from "../discord/DiscordJoinGate";
import { V1WelcomeModal } from "./V1WelcomeModal";

/** Le dernier message de l'équipe a priorité : pas de deuxième modal Discord par-dessus. */
export async function PlayerAnnouncements() {
  const user = await requireActiveUser();
  if (!user) return null;
  if (!needsReleaseWelcome(user.v1WelcomeSeenAt)) return <DiscordJoinGate />;
  return <V1WelcomeModal key={user.id} userId={user.id} isGuest={user.isGuest} />;
}
