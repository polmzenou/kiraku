// Codes perso du parrainage v2 (/i/TRISTREN), posés par l'équipe (ADMIN ou DEV) pour les Ambassadeurs et les streamers
// partenaires. Unique parmi les codes perso, et jamais de la forme d'un code standard (lib/referral/codes.ts) : un code
// saisi ne désigne jamais deux comptes. Le code standard du joueur marche toujours. Chaque pose ou retrait est écrit dans
// le journal de l'équipe. Client injecté : serveur ou tests sur base.
import type { PrismaClient } from "@/generated/prisma/client";
import { canManageReferrals } from "@/lib/admin/roles";
import { checkVanityCode } from "@/lib/referral/codes";
import { writeAdminLog } from "../admin/log";
import { lockPlayers } from "../social/lock";

export type VanityErrorCode = "FORMAT" | "STANDARD_SHAPE" | "TAKEN" | "NOT_FOUND" | "GUEST" | "FORBIDDEN";

export class VanityError extends Error {
  constructor(readonly code: VanityErrorCode) {
    super(code);
    this.name = "VanityError";
  }
}

const TX = { maxWait: 10_000, timeout: 15_000 };

const uniqueViolation = (e: unknown) => typeof e === "object" && e !== null && "code" in e && (e as { code: unknown }).code === "P2002";

/** Pose le code perso d'un joueur, ou le retire (`code` null). Renvoie le code posé et l'ancien. */
export async function setVanityCodeWith(
  db: PrismaClient,
  input: { staffId: string; userId: string; code: string | null },
): Promise<{ code: string | null; previous: string | null }> {
  let code: string | null = null;
  if (input.code !== null) {
    const checked = checkVanityCode(input.code);
    if (!checked.ok) throw new VanityError(checked.reason);
    code = checked.code;
  }
  try {
    return await db.$transaction(async (tx) => {
      await lockPlayers(tx, [input.staffId, input.userId]);
      // Le rôle est revérifié sous verrou : une session ouverte ne garde pas des droits retirés
      const staff = await tx.user.findUnique({ where: { id: input.staffId }, select: { role: true, bannedAt: true } });
      if (!staff || staff.bannedAt || !canManageReferrals(staff.role)) throw new VanityError("FORBIDDEN");
      const user = await tx.user.findUnique({ where: { id: input.userId }, select: { isGuest: true, vanityCode: true } });
      if (!user) throw new VanityError("NOT_FOUND");
      if (user.isGuest) throw new VanityError("GUEST");
      if (code !== null && (await tx.user.findFirst({ where: { vanityCode: code, id: { not: input.userId } }, select: { id: true } }))) {
        throw new VanityError("TAKEN");
      }
      await tx.user.update({ where: { id: input.userId }, data: { vanityCode: code }, select: { id: true } });
      await writeAdminLog(tx, {
        adminId: input.staffId,
        action: code ? "REFERRAL_VANITY_SET" : "REFERRAL_VANITY_CLEAR",
        targetType: "User",
        targetId: input.userId,
        before: { code: user.vanityCode },
        after: { code },
      });
      return { code, previous: user.vanityCode };
    }, TX);
  } catch (e) {
    // Le même code posé en même temps sur deux joueurs : l'index unique tranche
    if (uniqueViolation(e)) throw new VanityError("TAKEN");
    throw e;
  }
}

/** Le code est-il libre pour ce joueur (ou à lui déjà) ? Pour l'indication « Libre » du formulaire. */
export async function vanityStatusWith(
  db: PrismaClient,
  raw: string,
  forUserId: string | null,
): Promise<"FREE" | "TAKEN" | "FORMAT" | "STANDARD_SHAPE"> {
  const checked = checkVanityCode(raw);
  if (!checked.ok) return checked.reason;
  const owner = await db.user.findFirst({ where: { vanityCode: checked.code }, select: { id: true } });
  return !owner || owner.id === forUserId ? "FREE" : "TAKEN";
}
