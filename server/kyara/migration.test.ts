import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// Migration de l'import Kyara, rejouée dans un Postgres isolé en mémoire : les migrations d'avant, puis des comptes
// existants, puis celle de l'import (reprise de registeredAt) et celles d'après.

const KYARA = "20261122160000_kyara_import";
const ROOT = resolve("prisma/migrations");
const read = (folder: string) => readFileSync(resolve(ROOT, folder, "migration.sql"), "utf8");

const K1 = "2af84af1-f619-45a3-bc8b-7072d0a8fd10";
const K2 = "0b8c6f1e-1111-4222-8333-944455556666";

let pg: PGlite;

beforeAll(async () => {
  pg = new PGlite({ extensions: { pg_trgm } });
  const folders = readdirSync(ROOT).filter((f) => /^\d/.test(f)).sort();
  const at = folders.indexOf(KYARA);
  expect(at).toBeGreaterThan(0);
  for (const folder of folders.slice(0, at)) await pg.exec(read(folder));
  await pg.exec(`
    INSERT INTO "User" (id, username, "battleTeam", "isGuest", "createdAt", "discordLinkedAt") VALUES
      ('guest', 'guest-1', '{}', true, '2026-10-01', NULL),
      ('mail', 'mail', '{}', false, '2026-10-02', NULL),
      ('disc', 'disc', '{}', false, '2026-10-03', '2026-10-05');
  `);
  for (const folder of folders.slice(at)) await pg.exec(read(folder));
}, 120_000);
afterAll(async () => pg.close());
beforeEach(async () => {
  await pg.exec(`DELETE FROM "KyaraImport"; DELETE FROM "User" WHERE id NOT IN ('guest', 'mail', 'disc');`);
});

// En texte : PGlite lirait un TIMESTAMP sans fuseau dans le fuseau local de la machine
const registeredAt = async (id: string) =>
  (await pg.query<{ at: string | null }>(`SELECT to_char("registeredAt", 'YYYY-MM-DD HH24:MI:SS.MS') AS at FROM "User" WHERE id = '${id}'`)).rows[0]
    ?.at ?? null;

function insert(id: string, userId: string | null, discordId: string, kyaraUserId: string, status = "PENDING") {
  const read = status === "READY" || status === "DONE";
  const done = status === "DONE";
  return pg.exec(`
    INSERT INTO "KyaraImport" (id, "userId", "discordId", "kyaraUserId", status, snapshot, "receivedAt", "appliedAt", "grantedCards", "grantedZeni", "zeniRaw")
    VALUES ('${id}', ${userId ? `'${userId}'` : "NULL"}, '${discordId}', '${kyaraUserId}', '${status}',
            ${read ? `'[]'` : "NULL"}, ${read ? "now()" : "NULL"}, ${done ? "now()" : "NULL"}, ${done ? 1 : "NULL"}, ${done ? 0 : "NULL"}, ${done ? 0 : "NULL"})`);
}

describe("migration de l'import Kyara", () => {
  it("reprend la date d'inscription des comptes réels : liaison Discord, sinon création", async () => {
    expect(await registeredAt("guest")).toBeNull();
    expect(await registeredAt("mail")).toBe("2026-10-02 00:00:00.000");
    expect(await registeredAt("disc")).toBe("2026-10-05 00:00:00.000");
  });

  it("pose la date quand le compte devient réel, une seule fois", async () => {
    await pg.exec(`INSERT INTO "User" (id, username, "battleTeam", "isGuest") VALUES ('new', 'new', '{}', false), ('g2', 'guest-2', '{}', true)`);
    expect(await registeredAt("new")).not.toBeNull();
    expect(await registeredAt("g2")).toBeNull();
    // Un autre changement ne pose rien ; la montée de l'invité, si
    await pg.exec(`UPDATE "User" SET coins = coins + 10 WHERE id = 'g2'`);
    expect(await registeredAt("g2")).toBeNull();
    await pg.exec(`UPDATE "User" SET "isGuest" = false, username = 'g2' WHERE id = 'g2'`);
    const first = await registeredAt("g2");
    expect(first).not.toBeNull();
    // Jamais réécrite, même si isGuest est de nouveau écrit (liaison Discord d'un compte e-mail)
    await pg.exec(`UPDATE "User" SET "isGuest" = false WHERE id IN ('g2', 'mail')`);
    expect(await registeredAt("g2")).toBe(first);
    expect(await registeredAt("mail")).toBe("2026-10-02 00:00:00.000");
  });

  it("une demande en cours ou versée par compte ; refus et annulation ne verrouillent rien", async () => {
    await insert("a", "mail", "11111", K1);
    await expect(insert("b", "mail", "11111", K2)).rejects.toThrow();
    await pg.exec(`UPDATE "KyaraImport" SET status = 'REJECTED' WHERE id = 'a'`);
    await insert("c", "mail", "11111", K1);
    await pg.exec(`UPDATE "KyaraImport" SET status = 'CANCELLED' WHERE id = 'c'`);
    await insert("d", "mail", "11111", K1, "DONE");
    await expect(insert("e", "mail", "11111", K2)).rejects.toThrow();
  });

  it("un compte Discord ne sert qu'une fois, même après la suppression du compte (SetNull)", async () => {
    await pg.exec(`INSERT INTO "User" (id, username, "battleTeam", "isGuest") VALUES ('gone', 'gone', '{}', false)`);
    await insert("a", "gone", "22222", K1, "DONE");
    await pg.exec(`DELETE FROM "User" WHERE id = 'gone'`);
    const row = (await pg.query<{ userId: string | null }>(`SELECT "userId" FROM "KyaraImport" WHERE id = 'a'`)).rows[0];
    expect(row.userId).toBeNull();
    await expect(insert("b", "disc", "22222", K2)).rejects.toThrow();
    await insert("c", "disc", "33333", K2);
  });

  it("un profil Kyara n'est verrouillé qu'une fois lu : deux demandes possibles, une seule lecture", async () => {
    await insert("a", "mail", "11111", K1);
    await insert("b", "disc", "22222", K1);
    await pg.exec(`UPDATE "KyaraImport" SET status = 'READY', snapshot = '[]', "receivedAt" = now() WHERE id = 'a'`);
    await expect(pg.exec(`UPDATE "KyaraImport" SET status = 'READY', snapshot = '[]', "receivedAt" = now() WHERE id = 'b'`)).rejects.toThrow();
  });

  it("vérifie les ids, le lien de traitement et les états READY et DONE", async () => {
    await expect(insert("a", "mail", "11111", "pas-un-uuid")).rejects.toThrow();
    await expect(insert("a", "mail", "abc", K1)).rejects.toThrow();
    await insert("a", "mail", "11111", K1);
    await expect(pg.exec(`UPDATE "KyaraImport" SET "nonceHash" = '${"f".repeat(64)}' WHERE id = 'a'`)).rejects.toThrow();
    await pg.exec(`UPDATE "KyaraImport" SET "nonceHash" = '${"f".repeat(64)}', "nonceExpiresAt" = now() WHERE id = 'a'`);
    await expect(pg.exec(`UPDATE "KyaraImport" SET status = 'READY' WHERE id = 'a'`)).rejects.toThrow();
    await expect(pg.exec(`UPDATE "KyaraImport" SET status = 'DONE', snapshot = '[]', "receivedAt" = now() WHERE id = 'a'`)).rejects.toThrow();
    await expect(
      pg.exec(`UPDATE "KyaraImport" SET status = 'DONE', "appliedAt" = now(), "grantedCards" = 1, "grantedZeni" = 10, "zeniRaw" = 5 WHERE id = 'a'`),
    ).rejects.toThrow();
  });

  it("ajoute les valeurs d'enum et la marque des découvertes importées", async () => {
    await pg.exec(`SELECT 'KYARA_IMPORT'::"CoinReason", 'KYARA_IMPORT_DONE'::"NotificationType", 'KYARA_IMPORT_REJECTED'::"NotificationType"`);
    const col = await pg.query<{ column_default: string }>(
      `SELECT column_default FROM information_schema.columns WHERE table_name = 'Discovery' AND column_name = 'imported'`,
    );
    expect(col.rows[0].column_default).toBe("false");
  });
});
