// Pack hebdomadaire des ambassadeurs : une réclamation par semaine ISO (lundi 00:00, fuseau game.timeZone).
// Fonction pure : la réclamation elle-même est revérifiée sous verrou (server/ambassador/pack-core.ts).

export type PackStatus = "available" | "claimed" | "none";

/**
 * « none » : pas ambassadeur ou pack coupé (0 booster) ; « claimed » : déjà réclamé cette semaine ;
 * « available » : à réclamer.
 */
export function packStatus(input: { ambassador: boolean; weeklyBoosters: number; claimedKey: string | null }, weekKey: string): PackStatus {
  if (!input.ambassador || input.weeklyBoosters <= 0) return "none";
  return input.claimedKey === weekKey ? "claimed" : "available";
}
