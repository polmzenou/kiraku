import { getLocale } from "next-intl/server";
import { pendingAnnouncement } from "@/lib/welcome/release";
import { requireActiveUser } from "@/server/user";
import { getV25Data, getV2ShowcaseCards } from "@/server/welcome";
import { DiscordJoinGate } from "../discord/DiscordJoinGate";
import { V1WelcomeModal } from "./V1WelcomeModal";
import { V25AnnouncementModal } from "./V25AnnouncementModal";
import { V2AnnouncementModal } from "./V2AnnouncementModal";

/** Le dernier message de l'équipe a priorité : pas de deuxième modal Discord par-dessus. */
export async function PlayerAnnouncements() {
  const user = await requireActiveUser();
  if (!user) return null;
  const pending = pendingAnnouncement(user.v1WelcomeSeenAt);
  if (!pending) return <DiscordJoinGate />;
  if (pending.key === "apology") return <V1WelcomeModal key={user.id} userId={user.id} isGuest={user.isGuest} />;
  if (pending.key === "v2") return <V2AnnouncementModal key={user.id} userId={user.id} cards={await getV2ShowcaseCards()} />;
  return <V25AnnouncementModal key={user.id} userId={user.id} data={await getV25Data(user.id, await getLocale())} />;
}
