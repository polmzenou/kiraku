import { pendingAnnouncement } from "@/lib/welcome/release";
import { getSetting } from "@/server/settings";
import { requireActiveUser } from "@/server/user";
import { getV2ShowcaseCards, getV3TeaserCards } from "@/server/welcome";
import { DiscordJoinGate } from "../discord/DiscordJoinGate";
import { V1WelcomeModal } from "./V1WelcomeModal";
import { V2AnnouncementModal } from "./V2AnnouncementModal";
import { V3TeaserModal } from "./V3TeaserModal";

/** Le dernier message de l'équipe a priorité : pas de deuxième modal Discord par-dessus. */
export async function PlayerAnnouncements() {
  const user = await requireActiveUser();
  if (!user) return null;
  const pending = pendingAnnouncement(user.v1WelcomeSeenAt);
  if (!pending) return <DiscordJoinGate />;
  if (pending.key === "apology") return <V1WelcomeModal key={user.id} userId={user.id} isGuest={user.isGuest} />;
  if (pending.key === "v2") return <V2AnnouncementModal key={user.id} userId={user.id} cards={await getV2ShowcaseCards()} />;
  const [cards, divine, apocalypse] = await Promise.all([getV3TeaserCards(), getSetting("booster.divineOdds"), getSetting("booster.apocalypseOdds")]);
  return <V3TeaserModal key={user.id} userId={user.id} cards={cards} odds={{ divine, apocalypse }} />;
}
