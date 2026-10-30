import { pendingAnnouncement } from "@/lib/welcome/release";
import { requireActiveUser } from "@/server/user";
import { getV2ShowcaseCards } from "@/server/welcome";
import { DiscordJoinGate } from "../discord/DiscordJoinGate";
import { V1WelcomeModal } from "./V1WelcomeModal";
import { V2AnnouncementModal } from "./V2AnnouncementModal";

/**
 * Le dernier message de l'équipe a priorité : pas de deuxième modal Discord par-dessus. La v2.5 n'a
 * plus de modal (retiré) : en attente, elle laisse la place à l'invitation Discord.
 */
export async function PlayerAnnouncements() {
  const user = await requireActiveUser();
  if (!user) return null;
  const pending = pendingAnnouncement(user.v1WelcomeSeenAt);
  if (!pending || pending.key === "v25") return <DiscordJoinGate />;
  if (pending.key === "apology") return <V1WelcomeModal key={user.id} userId={user.id} isGuest={user.isGuest} />;
  return <V2AnnouncementModal key={user.id} userId={user.id} cards={await getV2ShowcaseCards()} />;
}
