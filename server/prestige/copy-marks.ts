import "server-only";
import type { FudaCopy } from "@/components/fuda/Fuda";
import { fudaCopyOf } from "@/lib/prestige/printing";
import { prisma } from "../db";
import { getPrintingSeals } from "./rules";

// Marques des exemplaires précis montrés sur les écrans (vente, annonce, échange, cadeau, casino, vitrine, combat) :
// héritage et édition gravée, lus d'un coup pour toute une liste. Un exemplaire ordinaire, recyclé ou inconnu
// n'a pas de marque : la fuda reste inchangée.

/** Marques des exemplaires spéciaux parmi `ids` (les ordinaires sont absents de la table rendue). */
export async function copyMarksOf(ids: readonly (string | null | undefined)[]): Promise<Map<string, FudaCopy>> {
  const wanted = [...new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0))];
  if (wanted.length === 0) return new Map();
  const rows = await prisma.userCard.findMany({
    where: { id: { in: wanted }, OR: [{ heritage: { gt: 0 } }, { printing: { not: null } }] },
    select: { id: true, heritage: true, printing: true, serial: true, edition: { select: { size: true } } },
  });
  if (rows.length === 0) return new Map();
  const seals = rows.some((r) => r.printing !== null) ? await getPrintingSeals() : {};
  return new Map(
    rows.flatMap((r) => {
      const copy = fudaCopyOf({ heritage: r.heritage, printing: r.printing, serial: r.serial, size: r.edition?.size ?? null }, seals);
      return copy ? [[r.id, copy] as const] : [];
    }),
  );
}

/** La vue d'une carte habillée de son exemplaire, s'il est spécial. */
export function withCopy<T extends object>(view: T, userCardId: string | null | undefined, marks: ReadonlyMap<string, FudaCopy>): T & { copy?: FudaCopy | null } {
  const copy = userCardId ? marks.get(userCardId) : undefined;
  return copy ? { ...view, copy } : view;
}
