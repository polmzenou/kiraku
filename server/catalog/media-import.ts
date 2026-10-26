// Import des personnages d'une seule œuvre (scripts/import-media.mts) : uniquement des AJOUTS.
// Aucune carte ni série existante n'est modifiée (ON CONFLICT DO NOTHING), aucun rang n'est
// recalculé. Comme import.ts : sans "server-only", base, fetch et pause injectés.
//
// Pas de ligne CatalogImport : `--finalize-only` reprend le dernier import non abandonné, et un
// import vide finalisé archiverait tout le catalogue.

import type { PrismaClient } from "@/generated/prisma/client";
import {
  ANILIST_ENDPOINT,
  MEDIA_CHARACTERS_PER_PAGE,
  MEDIA_CHARACTERS_QUERY,
  mediaCharactersResponseSchema,
  normalizeCharacter,
  type SkipReason,
} from "@/lib/catalog/anilist";
import type { CatalogCard, MediaCharacter, MediaEntry, MediaRole } from "@/lib/catalog/media-import";
import { nextDelay } from "@/lib/catalog/pacing";
import { buildSearchText } from "@/lib/catalog/search";
import { filterContext } from "@/lib/boosters/pool-filter";
import { parseSetting } from "@/lib/settings/defaults";
import { recomputeBoosterPools } from "../boosters/type-store";
import { bumpCatalogRevision, lockCatalog } from "./admin-core";

const FETCH_TIMEOUT_MS = 30_000;
const ROLES: readonly MediaRole[] = ["MAIN", "SUPPORTING", "BACKGROUND"];

export type MediaInfo = { id: number; type: string | null; title: string };
export type FetchMediaDeps = {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  log?: (message: string) => void;
  requestDelayMs: number;
  minTagRank: number;
};

/** Tous les personnages d'une œuvre, normalisés comme à l'import complet. null si l'œuvre n'existe pas. */
export async function fetchMediaCharacters(
  mediaId: number,
  deps: FetchMediaDeps,
): Promise<{ media: MediaInfo; characters: MediaCharacter[]; skipped: Record<SkipReason, number> } | null> {
  const doFetch = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const log = deps.log ?? (() => {});
  const skipped: Record<SkipReason, number> = { invalid: 0, noMedia: 0, noName: 0, badImage: 0 };
  const characters: MediaCharacter[] = [];
  let media: MediaInfo | null = null;

  for (let page = 1; ; page++) {
    for (let attempt = 1; ; attempt++) {
      let status: number | null = null;
      let retryAfter: string | null = null;
      let remaining: string | null = null;
      let body: unknown = null;
      try {
        const res = await doFetch(ANILIST_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ query: MEDIA_CHARACTERS_QUERY, variables: { id: mediaId, page, perPage: MEDIA_CHARACTERS_PER_PAGE } }),
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        status = res.status;
        retryAfter = res.headers.get("retry-after");
        remaining = res.headers.get("x-ratelimit-remaining");
        body = await res.json().catch(() => null);
      } catch {
        status = null;
      }
      // AniList répond 404 (avec Media: null) pour un id inconnu
      if (status === 404) return null;
      const decision = nextDelay({ status, retryAfter, remaining, attempt, baseDelayMs: deps.requestDelayMs });
      if (decision.action === "fail") throw new Error(`AniList : HTTP ${status ?? "réseau"} (page ${page}, essai ${attempt})`);
      if (decision.action === "retry") {
        log(`  HTTP ${status ?? "réseau"} sur la page ${page}, nouvel essai dans ${Math.round(decision.delayMs / 1000)} s`);
        await sleep(decision.delayMs);
        continue;
      }

      const parsed = mediaCharactersResponseSchema.safeParse(body);
      if (!parsed.success) throw new Error(`Réponse inattendue d'AniList (page ${page})`);
      const m = parsed.data.data.Media;
      if (!m) return null;
      media ??= { id: m.id, type: m.type ?? null, title: m.title?.english ?? m.title?.romaji ?? `#${m.id}` };
      for (const edge of m.characters.edges) {
        const n = normalizeCharacter(edge?.node, deps.minTagRank);
        if (!n.ok) skipped[n.reason]++;
        else characters.push({ character: n.character, mediaRole: ROLES.find((r) => r === edge?.role) ?? null });
      }
      if (!m.characters.pageInfo?.hasNextPage || m.characters.edges.length === 0) return { media, characters, skipped };
      await sleep(decision.delayMs);
      break;
    }
  }
}

/** Cartes AniList du catalogue (tous statuts), pour exclure les doublons et placer par favoris. */
export async function loadCatalogCards(db: PrismaClient): Promise<CatalogCard[]> {
  return db.card.findMany({
    where: { anilistId: { not: null } },
    select: { anilistId: true, favorites: true, rank: true, rarity: true, power: true, ki: true },
  });
}

/**
 * Écrit les nouvelles cartes en une transaction. Les anilistId apparus entre-temps sont écartés,
 * séries et cartes existantes restent intactes. Les champs fixés ici (statut, et rareté/stats
 * imposées) vont dans adminOverrides : un futur import complet ne les écrasera pas.
 */
export async function writeMediaCards(db: PrismaClient, entries: readonly MediaEntry[], status: "DRAFT" | "PUBLISHED") {
  const written = await db.$transaction(
    async (tx) => {
      await lockCatalog(tx);
      await tx.$executeRaw`LOCK TABLE "Card" IN SHARE ROW EXCLUSIVE MODE`;
      const ids = entries.map((e) => e.character.anilistId);
      const taken = new Set((await tx.card.findMany({ where: { anilistId: { in: ids } }, select: { anilistId: true } })).map((c) => c.anilistId));
      // Rangs à la suite du dernier rang réel, relu sous verrou
      const last = (await tx.card.aggregate({ _max: { rank: true } }))._max.rank ?? 0;
      const fresh = entries.filter((e) => !taken.has(e.character.anilistId)).map((e, i) => ({ ...e, rank: last + i + 1 }));
      if (fresh.length === 0) return [];

      const series = [...new Map(fresh.map((e) => [e.character.series.anilistId, e.character.series] as const)).values()];
      await tx.$executeRaw`
        INSERT INTO "Series" ("id", "anilistId", "type", "titleRomaji", "titleEnglish", "titleNative",
          "isAdult", "genres", "tags", "year", "season", "seasonYear", "studio")
        SELECT gen_random_uuid()::text, s."anilistId", s."type", s."titleRomaji", s."titleEnglish", s."titleNative",
          s."isAdult", COALESCE(s."genres", '{}'), COALESCE(s."tags", '{}'), s."year", s."season", s."seasonYear", s."studio"
        FROM jsonb_to_recordset(${JSON.stringify(series)}::jsonb) AS s(
          "anilistId" int, "type" text, "titleRomaji" text, "titleEnglish" text, "titleNative" text,
          "isAdult" boolean, "genres" text[], "tags" text[], "year" int, "season" text, "seasonYear" int, "studio" text)
        ON CONFLICT ("anilistId") DO NOTHING`;

      const cards = fresh.map((e) => {
        const c = e.character;
        return {
          anilistId: c.anilistId,
          name: c.name,
          nameNative: c.nameNative,
          imageUrl: c.imageUrl,
          favorites: c.favorites,
          rank: e.rank,
          rarity: e.rarity,
          power: e.power,
          ki: e.ki,
          seriesAnilistId: c.series.anilistId,
          gender: c.gender,
          birthMonth: c.birthMonth,
          birthDay: c.birthDay,
          role: c.role,
          status,
          overrides: e.forced ? ["status", "rarity", "power", "ki"] : ["status"],
          searchText: buildSearchText([c.name, c.nameNative, c.series.titleRomaji, c.series.titleEnglish, c.series.titleNative]),
        };
      });
      const inserted = await tx.$queryRaw<{ anilistId: number }[]>`
        INSERT INTO "Card" ("id", "anilistId", "name", "nameNative", "imageUrl", "favorites", "rank", "rarityKey",
          "power", "ki", "seriesId", "gender", "birthMonth", "birthDay", "role", "searchText", "status",
          "adminOverrides", "createdAt", "updatedAt")
        SELECT gen_random_uuid()::text, c."anilistId", c."name", c."nameNative", c."imageUrl", c."favorites",
          c."rank", c."rarity", c."power", c."ki", s."id", c."gender", c."birthMonth", c."birthDay",
          c."role", c."searchText", c."status"::"CatalogCardStatus", c."overrides", now(), now()
        FROM jsonb_to_recordset(${JSON.stringify(cards)}::jsonb) AS c(
          "anilistId" int, "name" text, "nameNative" text, "imageUrl" text, "favorites" int, "rank" int,
          "rarity" text, "power" int, "ki" int, "seriesAnilistId" int, "gender" text, "birthMonth" int,
          "birthDay" int, "role" text, "status" text, "overrides" text[], "searchText" text)
        JOIN "Series" s ON s."anilistId" = c."seriesAnilistId"
        ON CONFLICT ("anilistId") DO NOTHING
        RETURNING "anilistId"`;
      if (inserted.length !== fresh.length) throw new Error(`Écriture partielle (${inserted.length}/${fresh.length}) : rien n'a été enregistré.`);

      // Les brouillons ne sont dans aucun pool ; les cartes publiées y entrent tout de suite
      if (status === "PUBLISHED") {
        const tz = await tx.gameSetting.findUnique({ where: { key: "game.timeZone" }, select: { value: true } });
        await recomputeBoosterPools(tx, filterContext(new Date(), parseSetting("game.timeZone", tz?.value)));
      }
      await bumpCatalogRevision(tx);
      return fresh;
    },
    { timeout: 120_000, maxWait: 10_000 },
  );
  return written;
}
