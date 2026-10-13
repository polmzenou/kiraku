// Stockage Prisma de l'import AniList. Le client est injecté (script ou serveur) : pas de server/db.ts ici.

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { buildSearchText } from "@/lib/catalog/search";
import type { ImportRun, ImportStore, StagedRow } from "./import";
import { RUN_NOT_ACTIVE } from "./run-guard";

const BATCH = 1000;
const UNFINISHED = ["RUNNING", "FAILED"] as const;
const runSelect = { id: true, status: true, target: true, lastPage: true, kept: true } as const;

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function prismaImportStore(db: PrismaClient): ImportStore {
  return {
    async findResumable(target) {
      const run = await db.catalogImport.findFirst({
        where: { status: { in: [...UNFINISHED] }, target },
        orderBy: { startedAt: "desc" },
        select: runSelect,
      });
      if (!run) return null;
      if (run.status !== "RUNNING") {
        await db.catalogImport.update({ where: { id: run.id }, data: { status: "RUNNING", error: null } });
      }
      return { ...run, status: "RUNNING" } satisfies ImportRun;
    },

    async createRun(target) {
      return db.$transaction(async (tx) => {
        await tx.catalogImport.updateMany({
          where: { status: { in: [...UNFINISHED] } },
          data: { status: "ABANDONED", finishedAt: new Date() },
        });
        return tx.catalogImport.create({ data: { target }, select: runSelect });
      });
    },

    async abandonUnfinished() {
      await db.catalogImport.updateMany({
        where: { status: { in: [...UNFINISHED] } },
        data: { status: "ABANDONED", finishedAt: new Date() },
      });
    },

    async latestRun() {
      return db.catalogImport.findFirst({
        where: { status: { not: "ABANDONED" } },
        orderBy: { startedAt: "desc" },
        select: runSelect,
      });
    },

    async savePage(runId, page, rows) {
      // Une page = une transaction : rejouer une page interrompue ne crée jamais de doublon
      return db.$transaction(async (tx) => {
        // Verrouille la ligne de l'import et vérifie qu'il est toujours actif
        const active = await tx.catalogImport.updateMany({ where: { id: runId, status: "RUNNING" }, data: { lastPage: page } });
        if (active.count === 0) throw new Error(RUN_NOT_ACTIVE);
        const ids = rows.map((r) => r.anilistId);
        await tx.catalogImportRow.deleteMany({ where: { importId: runId, anilistId: { in: ids } } });
        await tx.catalogImportRow.createMany({
          data: rows.map((r) => ({
            importId: runId,
            anilistId: r.anilistId,
            position: r.position,
            favorites: r.favorites,
            data: r.data as Prisma.InputJsonValue,
          })),
        });
        const kept = await tx.catalogImportRow.count({ where: { importId: runId } });
        await tx.catalogImport.update({ where: { id: runId }, data: { kept } });
        return { kept };
      });
    },

    async stagedIdsBefore(runId, position) {
      const rows = await db.catalogImportRow.findMany({
        where: { importId: runId, position: { lt: position } },
        select: { anilistId: true },
      });
      return rows.map((r) => r.anilistId);
    },

    async markFailed(runId, error) {
      await db.catalogImport.update({ where: { id: runId }, data: { status: "FAILED", error: error.slice(0, 500) } });
    },

    async loadRows(runId) {
      const rows = await db.catalogImportRow.findMany({
        where: { importId: runId },
        select: { anilistId: true, position: true, favorites: true, data: true },
      });
      // Les données ont été validées par Zod avant d'être écrites dans le staging
      return rows as unknown as StagedRow[];
    },

    async catalogSnapshot() {
      return db.card.findMany({ select: { anilistId: true, rank: true, rarity: true } });
    },

    async finalize(runId, entries) {
      // Une série par œuvre ; la carte la mieux classée fait foi si deux lignes diffèrent (dernière écrite)
      const series = new Map([...entries].reverse().map((e) => [e.data.series.anilistId, e.data.series] as const));

      const cards = entries.map((e) => ({
        anilistId: e.anilistId,
        name: e.data.name,
        nameNative: e.data.nameNative,
        imageUrl: e.data.imageUrl,
        favorites: e.favorites,
        rank: e.rank,
        rarity: e.rarity,
        power: e.power,
        ki: e.ki,
        seriesAnilistId: e.data.series.anilistId,
        gender: e.data.gender,
        birthMonth: e.data.birthMonth,
        birthDay: e.data.birthDay,
        role: e.data.role,
        searchText: buildSearchText([
          e.data.name,
          e.data.nameNative,
          e.data.series.titleRomaji,
          e.data.series.titleEnglish,
          e.data.series.titleNative,
        ]),
      }));

      await db.$transaction(
        async (tx) => {
          // Un import abandonné ne publie jamais son classement (refinaliser un import FINALIZED reste permis)
          const claimed = await tx.catalogImport.updateMany({
            where: { id: runId, status: { in: ["RUNNING", "FINALIZED"] } },
            data: { status: "FINALIZED", finishedAt: new Date() },
          });
          if (claimed.count === 0) throw new Error(RUN_NOT_ACTIVE);

          // Libère l'unicité des rangs : les cartes absentes de ce classement sortent du catalogue
          await tx.$executeRaw`UPDATE "Card" SET "rank" = NULL WHERE "rank" IS NOT NULL`;

          for (const batch of chunks([...series.values()], BATCH)) {
            await tx.$executeRaw`
              INSERT INTO "Series" ("id", "anilistId", "type", "titleRomaji", "titleEnglish", "titleNative",
                "isAdult", "genres", "tags", "year", "season", "seasonYear", "studio")
              SELECT gen_random_uuid()::text, s."anilistId", s."type", s."titleRomaji", s."titleEnglish", s."titleNative",
                s."isAdult", COALESCE(s."genres", '{}'), COALESCE(s."tags", '{}'), s."year", s."season", s."seasonYear", s."studio"
              FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) AS s(
                "anilistId" int, "type" text, "titleRomaji" text, "titleEnglish" text, "titleNative" text,
                "isAdult" boolean, "genres" text[], "tags" text[], "year" int, "season" text, "seasonYear" int, "studio" text)
              ON CONFLICT ("anilistId") DO UPDATE SET
                "type" = EXCLUDED."type", "titleRomaji" = EXCLUDED."titleRomaji",
                "titleEnglish" = EXCLUDED."titleEnglish", "titleNative" = EXCLUDED."titleNative",
                "isAdult" = EXCLUDED."isAdult", "genres" = EXCLUDED."genres", "tags" = EXCLUDED."tags",
                "year" = EXCLUDED."year", "season" = EXCLUDED."season", "seasonYear" = EXCLUDED."seasonYear",
                "studio" = EXCLUDED."studio"`;
          }

          for (const batch of chunks(cards, BATCH)) {
            await tx.$executeRaw`
              INSERT INTO "Card" ("id", "anilistId", "name", "nameNative", "imageUrl", "favorites", "rank", "rarity",
                "power", "ki", "seriesId", "gender", "birthMonth", "birthDay", "role", "searchText", "addedImportId",
                "createdAt", "updatedAt")
              SELECT gen_random_uuid()::text, c."anilistId", c."name", c."nameNative", c."imageUrl", c."favorites",
                c."rank", c."rarity"::"Rarity", c."power", c."ki", s."id", c."gender", c."birthMonth", c."birthDay",
                c."role", c."searchText", ${runId}, now(), now()
              FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) AS c(
                "anilistId" int, "name" text, "nameNative" text, "imageUrl" text, "favorites" int, "rank" int,
                "rarity" text, "power" int, "ki" int, "seriesAnilistId" int, "gender" text, "birthMonth" int,
                "birthDay" int, "role" text, "searchText" text)
              JOIN "Series" s ON s."anilistId" = c."seriesAnilistId"
              ON CONFLICT ("anilistId") DO UPDATE SET
                "name" = EXCLUDED."name", "nameNative" = EXCLUDED."nameNative", "imageUrl" = EXCLUDED."imageUrl",
                "favorites" = EXCLUDED."favorites", "rank" = EXCLUDED."rank", "rarity" = EXCLUDED."rarity",
                "power" = EXCLUDED."power", "ki" = EXCLUDED."ki", "seriesId" = EXCLUDED."seriesId",
                "gender" = EXCLUDED."gender", "birthMonth" = EXCLUDED."birthMonth", "birthDay" = EXCLUDED."birthDay",
                "role" = EXCLUDED."role", "searchText" = EXCLUDED."searchText", "updatedAt" = now()`;
          }
        },
        { timeout: 120_000, maxWait: 10_000 },
      );

      // Le staging des imports précédents ne sert plus (celui-ci reste pour --finalize-only)
      await db.catalogImportRow.deleteMany({ where: { importId: { not: runId } } });
    },
  };
}
