import { getEventGaugeNow } from "@/server/home/event-gauge";
import { getSetting } from "@/server/settings";
import { requireActiveUser } from "@/server/user";
import { getV2ShowcaseCards, pendingAnnouncementFor } from "@/server/welcome";
import { CasinoAnnouncementModal } from "../casino/CasinoAnnouncementModal";
import { ReferralStory } from "../referral/ReferralStory";
import { EventGauge } from "../home/EventGauge";
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
  const pending = await pendingAnnouncementFor(user);
  if (!pending || pending.key === "v25") return <DiscordJoinGate />;
  if (pending.key === "casino") {
    const [{ gauge, serverNow }, refresh] = await Promise.all([getEventGaugeNow(), getSetting("home.eventGauge.refreshSeconds")]);
    // La jauge de l'inauguration (lancers) accompagne l'annonce
    const flips = gauge?.metric === "COINFLIPS" ? gauge : null;
    return (
      <CasinoAnnouncementModal
        key={user.id}
        userId={user.id}
        gauge={flips && <EventGauge initial={flips} refreshSeconds={refresh} serverNow={serverNow} cta={null} compact />}
      />
    );
  }
  if (pending.key === "referral") return <ReferralStory key={user.id} mode="announce" userId={user.id} isGuest={user.isGuest} />;
  if (pending.key === "apology") return <V1WelcomeModal key={user.id} userId={user.id} isGuest={user.isGuest} />;
  return <V2AnnouncementModal key={user.id} userId={user.id} cards={await getV2ShowcaseCards()} />;
}
