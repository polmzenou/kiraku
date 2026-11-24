import "server-only";
import type { GuestInvite } from "@/components/opening/GuestSignupPrompt";
import { pendingReferralCode } from "../economy/referral";
import { referrerByCode } from "../og/data";
import { getSetting } from "../settings";
import { referralV2Rules } from "./deps";
import { referralGifts } from "./queries";
import { ennichiInviteMultiplier } from "../ennichi/hooks";

/**
 * Invité arrivé par le lien d'un parrain (cookie du lien d'invitation, parrainage v2) : le nom du parrain et le cadeau
 * de bienvenue, montrés après son premier booster. null sans lien suivi, parrain indisponible ou v2 coupée.
 */
export async function guestInviteOf(locale: string): Promise<GuestInvite | null> {
  if (!(await getSetting("referral.v2.enabled"))) return null;
  const code = await pendingReferralCode();
  if (!code) return null;
  const referrer = await referrerByCode(code).catch(() => null);
  if (!referrer) return null;
  const { steps } = await referralGifts(await referralV2Rules(), locale, 0);
  // Ennichi : le cadeau des étapes 1 et 2 est multiplié pendant la fête
  return { referrer: referrer.username, lot: steps[0]?.referee ?? null, multiplier: await ennichiInviteMultiplier() };
}
