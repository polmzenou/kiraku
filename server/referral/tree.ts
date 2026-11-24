import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "../db";

// Arbre des liens sur le profil (parrainage v2) : le parrain du joueur, ses filleuls installés et les leurs, sur deux
// niveaux. Seuls les amis installés y figurent (même prédicat que les paliers), jamais un compte banni ; un profil qui
// n'est pas public reste anonyme (son pseudo ne quitte pas le serveur), sauf pour lui-même. Le joueur peut masquer son
// arbre aux autres (User.referralTreeHidden).

/** Parrainage qui compte : ni révoqué, ni bloqué sans décision. */
const COUNTED = { revokedAt: null, status: { not: "REVOKED" }, OR: [{ heldAt: null }, { reviewDecision: "VALIDATED" }] } satisfies Prisma.ReferralWhereInput;
/** Ami installé : parrainage qui compte, étape 2 atteinte. */
const INSTALLED = { ...COUNTED, step2At: { not: null } } satisfies Prisma.ReferralWhereInput;
const PERSON = { id: true, username: true, profileVisibility: true, titleAgreement: true } satisfies Prisma.UserSelect;
type PersonRow = Prisma.UserGetPayload<{ select: typeof PERSON }>;

const MAX_KIDS = 200;
const MAX_GRANDKIDS = 1_000;

/** Un nœud de l'arbre : clé de rendu, pseudo (null : profil privé), accord du joueur (parrain ou marraine). */
export type TreeNodeView = { key: string; name: string | null; fem: boolean };
export type ReferralTreeView = {
  hidden: boolean;
  /** Accord du propriétaire (« Parrainé » ou « Parrainée par »). */
  ownerFem: boolean;
  up: TreeNodeView | null;
  kids: { node: TreeNodeView; kids: TreeNodeView[] }[];
  counts: { kids: number; grandkids: number };
};

export async function referralTreeOf(ownerId: string, viewerId: string | null): Promise<ReferralTreeView> {
  const [owner, up, kids] = await Promise.all([
    prisma.user.findUnique({ where: { id: ownerId }, select: { referralTreeHidden: true, titleAgreement: true } }),
    prisma.referral.findFirst({ where: { refereeId: ownerId, ...COUNTED, referrer: { bannedAt: null } }, select: { referrer: { select: PERSON } } }),
    prisma.referral.findMany({
      where: { referrerId: ownerId, ...INSTALLED, referee: { bannedAt: null } },
      orderBy: [{ step2At: "asc" }, { id: "asc" }],
      take: MAX_KIDS,
      select: { referee: { select: PERSON } },
    }),
  ]);
  const kidIds = kids.map((k) => k.referee.id);
  const grand = kidIds.length
    ? await prisma.referral.findMany({
        where: { referrerId: { in: kidIds }, ...INSTALLED, referee: { bannedAt: null } },
        orderBy: [{ step2At: "asc" }, { id: "asc" }],
        take: MAX_GRANDKIDS,
        select: { referrerId: true, referee: { select: PERSON } },
      })
    : [];

  let next = 0;
  const node = (u: PersonRow): TreeNodeView => ({
    key: `n${next++}`,
    name: u.id === viewerId || u.profileVisibility === "PUBLIC" ? u.username : null,
    fem: u.titleAgreement === "FEM",
  });
  const byParent = new Map<string, PersonRow[]>();
  for (const g of grand) byParent.set(g.referrerId, [...(byParent.get(g.referrerId) ?? []), g.referee]);

  return {
    hidden: owner?.referralTreeHidden ?? false,
    ownerFem: owner?.titleAgreement === "FEM",
    up: up ? node(up.referrer) : null,
    kids: kids.map((k) => ({ node: node(k.referee), kids: (byParent.get(k.referee.id) ?? []).map(node) })),
    counts: { kids: kids.length, grandkids: grand.length },
  };
}
