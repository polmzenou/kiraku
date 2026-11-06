// Univers de séries : relations AniList du script (npm run catalog:universes) et écritures de
// /admin/univers. Comme media-import.ts : sans "server-only", base, fetch et pause injectés.
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { ANILIST_ENDPOINT, MEDIA_RELATIONS_PER_PAGE, MEDIA_RELATIONS_QUERY, mediaRelationsResponseSchema } from "@/lib/catalog/anilist";
import { nextDelay } from "@/lib/catalog/pacing";
import { universeName, type RelationEdge, type UniversePlan } from "@/lib/catalog/universes";
import { writeAdminLog } from "../admin/log";

const FETCH_TIMEOUT_MS = 30_000;

export type FetchRelationsDeps = {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  log?: (message: string) => void;
  requestDelayMs: number;
};

/** Relations de toutes ces œuvres, par paquets. `missing` : ids qu'AniList n'a pas rendus. */
export async function fetchMediaRelations(anilistIds: readonly number[], deps: FetchRelationsDeps): Promise<{ edges: RelationEdge[]; missing: number[] }> {
  const doFetch = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const log = deps.log ?? (() => {});
  const edges: RelationEdge[] = [];
  const seen = new Set<number>();
  const pages = Math.ceil(anilistIds.length / MEDIA_RELATIONS_PER_PAGE);

  for (let page = 0; page < pages; page++) {
    const ids = anilistIds.slice(page * MEDIA_RELATIONS_PER_PAGE, (page + 1) * MEDIA_RELATIONS_PER_PAGE);
    for (let attempt = 1; ; attempt++) {
      let status: number | null = null;
      let retryAfter: string | null = null;
      let remaining: string | null = null;
      let body: unknown = null;
      try {
        const res = await doFetch(ANILIST_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ query: MEDIA_RELATIONS_QUERY, variables: { ids, perPage: MEDIA_RELATIONS_PER_PAGE } }),
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        status = res.status;
        retryAfter = res.headers.get("retry-after");
        remaining = res.headers.get("x-ratelimit-remaining");
        body = await res.json().catch(() => null);
      } catch {
        status = null;
      }
      const decision = nextDelay({ status, retryAfter, remaining, attempt, baseDelayMs: deps.requestDelayMs });
      if (decision.action === "fail") throw new Error(`AniList : HTTP ${status ?? "réseau"} (paquet ${page + 1}/${pages}, essai ${attempt})`);
      if (decision.action === "retry") {
        log(`  HTTP ${status ?? "réseau"} sur le paquet ${page + 1}/${pages}, nouvel essai dans ${Math.round(decision.delayMs / 1000)} s`);
        await sleep(decision.delayMs);
        continue;
      }

      const parsed = mediaRelationsResponseSchema.safeParse(body);
      if (!parsed.success) throw new Error(`Réponse inattendue d'AniList (paquet ${page + 1}/${pages})`);
      for (const media of parsed.data.data.Page.media) {
        seen.add(media.id);
        for (const edge of media.relations?.edges ?? []) {
          if (edge?.relationType && edge.node) edges.push({ from: media.id, to: edge.node.id, type: edge.relationType });
        }
      }
      if (page < pages - 1) await sleep(decision.delayMs);
      break;
    }
  }
  return { edges, missing: anilistIds.filter((id) => !seen.has(id)) };
}

/**
 * Écrit le plan du script en une transaction. La condition `universeId: null` protège ce que l'admin a
 * rangé pendant que le script interrogeait AniList : une série déjà rangée ne bouge jamais.
 */
export async function applyUniversePlan(db: PrismaClient, plan: UniversePlan): Promise<{ created: number; moved: number }> {
  return db.$transaction(async (tx) => {
    let moved = 0;
    const place = async (universeId: string, seriesIds: string[]) => {
      const { count } = await tx.series.updateMany({ where: { id: { in: seriesIds }, universeId: null }, data: { universeId } });
      moved += count;
    };
    for (const group of plan.create) {
      const universe = await tx.universe.create({ data: { name: group.name }, select: { id: true } });
      await place(universe.id, group.series.map((s) => s.id));
    }
    for (const group of plan.join) await place(group.universeId, group.series.map((s) => s.id));
    return { created: plan.create.length, moved };
  });
}

// --- /admin/univers : chaque écriture et son journal dans la même transaction ---

export type UniverseErrorCode = "NOT_FOUND" | "SAME" | "ALONE";

export class UniverseError extends Error {
  constructor(readonly code: UniverseErrorCode) {
    super(code);
    this.name = "UniverseError";
  }
}

type Tx = Prisma.TransactionClient;
const LOG_TARGET = "Universe";

async function seriesIdsOf(tx: Tx, universeId: string): Promise<string[]> {
  return (await tx.series.findMany({ where: { universeId }, orderBy: { id: "asc" }, select: { id: true } })).map((s) => s.id);
}

async function requireUniverse(tx: Tx, universeId: string) {
  const universe = await tx.universe.findUnique({ where: { id: universeId }, select: { id: true, name: true } });
  if (!universe) throw new UniverseError("NOT_FOUND");
  return universe;
}

export async function createUniverseWith(db: PrismaClient, adminId: string, name: string): Promise<{ id: string }> {
  return db.$transaction(async (tx) => {
    const universe = await tx.universe.create({ data: { name }, select: { id: true } });
    await writeAdminLog(tx, { adminId, action: "UNIVERSE_CREATE", targetType: LOG_TARGET, targetId: universe.id, after: { name } });
    return universe;
  });
}

export async function renameUniverseWith(db: PrismaClient, adminId: string, universeId: string, name: string) {
  await db.$transaction(async (tx) => {
    const before = await requireUniverse(tx, universeId);
    await tx.universe.update({ where: { id: universeId }, data: { name } });
    await writeAdminLog(tx, { adminId, action: "UNIVERSE_RENAME", targetType: LOG_TARGET, targetId: universeId, before: { name: before.name }, after: { name } });
  });
}

/** Range une série dans cet univers ; si elle était ailleurs, elle change d'univers. */
export async function addSeriesToUniverseWith(db: PrismaClient, adminId: string, universeId: string, seriesId: string) {
  await db.$transaction(async (tx) => {
    await requireUniverse(tx, universeId);
    const series = await tx.series.findUnique({ where: { id: seriesId }, select: { universeId: true } });
    if (!series) throw new UniverseError("NOT_FOUND");
    await tx.series.update({ where: { id: seriesId }, data: { universeId } });
    await writeAdminLog(tx, {
      adminId,
      action: "UNIVERSE_ADD_SERIES",
      targetType: LOG_TARGET,
      targetId: universeId,
      before: { seriesId, universeId: series.universeId },
      after: { seriesId, universeId },
    });
  });
}

/**
 * Sort une série de son univers. Elle en reçoit un à elle seule plutôt que de redevenir « sans univers » :
 * le script du catalogue la replacerait sinon au prochain passage.
 */
export async function removeSeriesFromUniverseWith(db: PrismaClient, adminId: string, universeId: string, seriesId: string): Promise<{ id: string }> {
  return db.$transaction(async (tx) => {
    const series = await tx.series.findFirst({ where: { id: seriesId, universeId }, select: { titleRomaji: true } });
    if (!series) throw new UniverseError("NOT_FOUND");
    if ((await tx.series.count({ where: { universeId } })) < 2) throw new UniverseError("ALONE");
    const alone = await tx.universe.create({ data: { name: universeName([series]) }, select: { id: true } });
    const { count } = await tx.series.updateMany({ where: { id: seriesId, universeId }, data: { universeId: alone.id } });
    if (count === 0) throw new UniverseError("NOT_FOUND");
    await writeAdminLog(tx, {
      adminId,
      action: "UNIVERSE_REMOVE_SERIES",
      targetType: LOG_TARGET,
      targetId: universeId,
      before: { seriesId, universeId },
      after: { seriesId, universeId: alone.id },
    });
    return alone;
  });
}

/** Verse les séries de `fromId` dans `intoId` puis supprime `fromId`. */
export async function mergeUniversesWith(db: PrismaClient, adminId: string, fromId: string, intoId: string) {
  if (fromId === intoId) throw new UniverseError("SAME");
  await db.$transaction(async (tx) => {
    const [from, into] = [await requireUniverse(tx, fromId), await requireUniverse(tx, intoId)];
    const seriesIds = await seriesIdsOf(tx, fromId);
    await tx.series.updateMany({ where: { universeId: fromId }, data: { universeId: intoId } });
    await tx.universe.delete({ where: { id: fromId } });
    await writeAdminLog(tx, {
      adminId,
      action: "UNIVERSE_MERGE",
      targetType: LOG_TARGET,
      targetId: intoId,
      before: { from: { id: from.id, name: from.name, seriesIds } },
      after: { into: { id: into.id, name: into.name } },
    });
  });
}

/** Supprime l'univers : ses séries repassent sans univers (onDelete: SetNull). */
export async function deleteUniverseWith(db: PrismaClient, adminId: string, universeId: string) {
  await db.$transaction(async (tx) => {
    const universe = await requireUniverse(tx, universeId);
    const seriesIds = await seriesIdsOf(tx, universeId);
    await tx.universe.delete({ where: { id: universeId } });
    await writeAdminLog(tx, { adminId, action: "UNIVERSE_DELETE", targetType: LOG_TARGET, targetId: universeId, before: { name: universe.name, seriesIds } });
  });
}
