import type { RankedRules } from "@/lib/ranked/rules";
import { rankOf } from "@/lib/ranked/rules";
import type { SeasonSnapshot } from "@/lib/discord/season";
import type { Tx } from "../social/lock";

export type SeasonStandingRow = { position: number; ahead: number; total: number; username: string; image: string | null; pc: number; public: boolean };

export function seasonSnapshot(rows: readonly SeasonStandingRow[], number: number, now: Date, rules: RankedRules): SeasonSnapshot {
  return {
    version: 1, number, nextNumber: number + 1, closedAt: now.toISOString(), total: rows[0]?.total ?? 0,
    entries: rows.filter((row) => row.public).slice(0, 10).map((row) => {
      const rank = rankOf(row.pc, row.ahead < rules.grandChampion.top, rules);
      return { position: row.position, username: row.username, image: row.image, pc: row.pc, tier: rank.tier, division: rank.division };
    }),
  };
}

/** Même classement que /classement : les profils privés conservent leur place mais leur identité ne sort pas. */
export async function captureSeasonSnapshot(tx: Pick<Tx, "$queryRaw">, number: number, now: Date, rules: RankedRules): Promise<SeasonSnapshot> {
  const rows = await tx.$queryRaw<SeasonStandingRow[]>`
    SELECT * FROM (SELECT (ROW_NUMBER() OVER (ORDER BY u."rankPoints" DESC, u."createdAt" ASC, u.id ASC))::int AS position,
      (RANK() OVER (ORDER BY u."rankPoints" DESC))::int - 1 AS ahead,
      (COUNT(*) OVER ())::int AS total, u.username, u.image, u."rankPoints" AS pc,
      (u."profileVisibility" = 'PUBLIC') AS public
    FROM "User" u WHERE u."bannedAt" IS NULL AND u."isGuest" = false AND u."rankPoints" > 0
    ) ranked WHERE public ORDER BY position LIMIT 10`;
  return seasonSnapshot(rows, number, now, rules);
}
