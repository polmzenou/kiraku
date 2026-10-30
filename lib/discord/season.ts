import { z } from "@/lib/zod";
import { BOARD_TIERS } from "@/lib/battle/tiers";

export const seasonSnapshotSchema = z.object({
  version: z.literal(1),
  number: z.number().int().positive(),
  nextNumber: z.number().int().positive(),
  closedAt: z.string().datetime(),
  total: z.number().int().nonnegative(),
  entries: z.array(z.object({
    position: z.number().int().positive(), username: z.string().min(1).max(100),
    image: z.string().nullable(), pc: z.number().int().nonnegative(),
    tier: z.enum(BOARD_TIERS), division: z.union([z.literal(1), z.literal(2), z.literal(3), z.null()]),
  })).max(10),
});

export type SeasonSnapshot = z.infer<typeof seasonSnapshotSchema>;

const NAMES = { BRONZE: "Bronze", SILVER: "Argent", GOLD: "Or", EMERALD: "Émeraude", ELITE: "Élite", CHAMPION: "Champion", GRAND_CHAMPION: "Grand Champion" } as const;
export function seasonRankName(entry: SeasonSnapshot["entries"][number]): string {
  return NAMES[entry.tier] + (entry.division ? ` ${["", "I", "II", "III"][entry.division]}` : "");
}
