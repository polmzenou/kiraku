import "server-only";
import { prisma } from "../db";

export const DATA_REQUEST_FILTERS = ["pending", "deletion", "export", "all"] as const;
export type DataRequestFilter = (typeof DATA_REQUEST_FILTERS)[number];

export function parseDataRequestFilter(raw: string | undefined): DataRequestFilter {
  return (DATA_REQUEST_FILTERS as readonly string[]).includes(raw ?? "") ? (raw as DataRequestFilter) : "pending";
}

const PAGE = 50;

/** Demandes RGPD pour /admin/donnees : en attente d'abord par échéance, sinon les plus récentes. */
export async function listDataRequests(filter: DataRequestFilter) {
  const where =
    filter === "pending"
      ? { kind: "DELETION" as const, status: "PENDING" as const }
      : filter === "deletion"
        ? { kind: "DELETION" as const }
        : filter === "export"
          ? { kind: "EXPORT" as const }
          : {};
  const [items, pending] = await Promise.all([
    prisma.dataRequest.findMany({
      where,
      orderBy: filter === "pending" ? [{ dueAt: "asc" }] : [{ requestedAt: "desc" }],
      take: PAGE,
      select: {
        id: true,
        kind: true,
        status: true,
        requestedAt: true,
        dueAt: true,
        processedAt: true,
        user: { select: { id: true, username: true, anonymizedAt: true } },
        processedBy: { select: { username: true } },
      },
    }),
    prisma.dataRequest.count({ where: { kind: "DELETION", status: "PENDING" } }),
  ]);
  return { items, pending };
}
