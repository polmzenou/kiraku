// Ambassadeurs proposés par le parrainage v2 : la proposition se crée toute seule au palier qui le prévoit
// (payout-core.ts, une seule ouverte par joueur), puis l'équipe (ADMIN ou DEV) l'accepte ou la refuse depuis
// /admin/parrainage. Accepter pose le vrai rôle, comme la fiche d'un joueur dans l'admin (setAmbassadorInTx). Tout se
// passe dans une transaction : proposition verrouillée, membre de l'équipe et joueur verrouillés, journal de l'équipe.
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { canManageReferrals } from "@/lib/admin/roles";
import { writeAdminLog } from "../admin/log";
import { AMBASSADOR_USER_SELECT, setAmbassadorInTx } from "../admin/users-core";
import { lockPlayers } from "../social/lock";
import { notifyingTransaction, type OnNotified } from "../social/notify";

export type AmbassadorDecisionErrorCode = "NOT_FOUND" | "ALREADY_DECIDED" | "FORBIDDEN" | "BANNED";

export class AmbassadorDecisionError extends Error {
  constructor(readonly code: AmbassadorDecisionErrorCode) {
    super(code);
    this.name = "AmbassadorDecisionError";
  }
}

const TX = { maxWait: 10_000, timeout: 20_000 };
// Dates en texte ISO pour le journal (JSON)
const json = (v: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(v));

/** Accepte (le rôle est posé, le joueur prévenu) ou refuse une proposition encore ouverte. */
export async function decideAmbassadorWith(
  db: PrismaClient,
  input: { staffId: string; proposalId: string; accept: boolean; now: Date },
  onNotified?: OnNotified,
): Promise<{ userId: string }> {
  return notifyingTransaction(
    db,
    async (tx) => {
      const [proposal] = await tx.$queryRaw<{ userId: string; installed: number; decidedAt: Date | null }[]>`
        SELECT "userId", "installed", "decidedAt" FROM "AmbassadorProposal" WHERE "id" = ${input.proposalId} FOR UPDATE`;
      if (!proposal) throw new AmbassadorDecisionError("NOT_FOUND");
      if (proposal.decidedAt) throw new AmbassadorDecisionError("ALREADY_DECIDED");

      await lockPlayers(tx, [input.staffId, proposal.userId]);
      // Le rôle est revérifié sous verrou : une session ouverte ne garde pas des droits retirés
      const staff = await tx.user.findUnique({ where: { id: input.staffId }, select: { role: true, bannedAt: true } });
      if (!staff || staff.bannedAt || !canManageReferrals(staff.role)) throw new AmbassadorDecisionError("FORBIDDEN");
      const user = await tx.user.findUnique({ where: { id: proposal.userId }, select: { ...AMBASSADOR_USER_SELECT, bannedAt: true } });
      if (!user) throw new AmbassadorDecisionError("NOT_FOUND");
      if (input.accept && user.bannedAt) throw new AmbassadorDecisionError("BANNED");

      const change = input.accept ? await setAmbassadorInTx(tx, user, true, { actorId: input.staffId, now: input.now }) : null;
      await tx.ambassadorProposal.update({
        where: { id: input.proposalId },
        data: { decidedAt: input.now, decidedById: input.staffId, accepted: input.accept },
        select: { id: true },
      });
      await writeAdminLog(tx, {
        adminId: input.staffId,
        action: input.accept ? "AMBASSADOR_ACCEPT" : "AMBASSADOR_REFUSE",
        targetType: "AmbassadorProposal",
        targetId: input.proposalId,
        ...(change ? { before: json(change.before) } : {}),
        after: json({ userId: proposal.userId, installed: proposal.installed, ...(change ? { change: change.after } : {}) }),
      });
      return { userId: proposal.userId };
    },
    TX,
    onNotified,
  );
}
