import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Migration du parrainage v2, rejouée dans un Postgres isolé en mémoire : les migrations d'avant, puis des parrainages
// et des ouvertures existants, puis celle du parrainage v2 et celles d'après.

const V2 = "20261124120000_referral_v2";
const ROOT = resolve("prisma/migrations");
const read = (folder: string) => readFileSync(resolve(ROOT, folder, "migration.sql"), "utf8");
const HASH = "a".repeat(64);

let pg: PGlite;

beforeAll(async () => {
  pg = new PGlite({ extensions: { pg_trgm } });
  const folders = readdirSync(ROOT).filter((f) => /^\d/.test(f)).sort();
  const at = folders.indexOf(V2);
  expect(at).toBeGreaterThan(0);
  for (const folder of folders.slice(0, at)) await pg.exec(read(folder));
  await pg.exec(`
    INSERT INTO "User" (id, username, "battleTeam", "isGuest", "createdAt") VALUES
      ('par', 'par', '{}', false, '2026-09-01'),
      ('ref1', 'ref1', '{}', false, '2026-10-01'),
      ('ref2', 'ref2', '{}', false, '2026-11-20'),
      ('other', 'other', '{}', false, '2026-09-02');
    INSERT INTO "Referral" (id, "referrerId", "refereeId", status, "createdAt", "qualifiedAt") VALUES
      ('r1', 'par', 'ref1', 'QUALIFIED', '2026-10-01 10:00', '2026-10-03 12:00'),
      ('r2', 'par', 'ref2', 'PENDING', '2026-11-20 10:00', NULL);
    INSERT INTO "BoosterOpening" (id, "userId", "boosterSlug", "cardIds", "catalogCardIds", "zeniSpent", "sealedDropId") VALUES
      ('o-free', 'other', 'standard', '{}', '{}', 0, NULL),
      ('o-paid', 'other', 'standard', '{}', '{}', 200, NULL),
      ('o-sealed', 'other', 'divin', '{}', '{}', 0, 'drop-1');
  `);
  for (const folder of folders.slice(at)) await pg.exec(read(folder));
}, 120_000);
afterAll(async () => pg.close());

const rows = async <T>(sql: string) => (await pg.query<T>(sql)).rows;
const refused = async (sql: string, constraint: RegExp) => {
  await expect(pg.exec(sql)).rejects.toThrow(constraint);
};

describe("migration du parrainage v2", () => {
  it("un ami qualifié en v1 compte comme installé : étape 2 = qualification, en version 1", async () => {
    const referrals = await rows<{ id: string; version: number; step2: string | null }>(
      `SELECT id, version, to_char("step2At", 'YYYY-MM-DD HH24:MI') AS step2 FROM "Referral" ORDER BY id`,
    );
    expect(referrals).toEqual([
      { id: "r1", version: 1, step2: "2026-10-03 12:00" },
      { id: "r2", version: 1, step2: null },
    ]);
  });

  it("classe les ouvertures passées ; une ouverture écrite sans origine compte comme un cadeau", async () => {
    await pg.exec(`INSERT INTO "BoosterOpening" (id, "userId", "boosterSlug", "cardIds", "catalogCardIds") VALUES ('o-new', 'other', 'standard', '{}', '{}')`);
    expect(await rows(`SELECT id, source FROM "BoosterOpening" ORDER BY id`)).toEqual([
      { id: "o-free", source: "FREE" },
      { id: "o-new", source: "CREDIT" },
      { id: "o-paid", source: "PAID" },
      { id: "o-sealed", source: "SEALED" },
    ]);
  });

  it("code perso : motif, disjoint des codes standard, unique", async () => {
    await pg.exec(`UPDATE "User" SET "vanityCode" = 'TRISTREN' WHERE id = 'par'`);
    await refused(`UPDATE "User" SET "vanityCode" = 'PAULMEHR' WHERE id = 'other'`, /User_vanityCode_check/);
    await refused(`UPDATE "User" SET "vanityCode" = 'abc' WHERE id = 'other'`, /User_vanityCode_check/);
    await refused(`UPDATE "User" SET "vanityCode" = 'TRISTREN' WHERE id = 'other'`, /User_vanityCode_key/);
    expect(await rows(`SELECT "referralTreeHidden", "referredAt" FROM "User" WHERE id = 'par'`)).toEqual([{ referralTreeHidden: false, referredAt: null }]);
  });

  it("en v2, une étape exige la précédente, sauf l'étape 4 après une étape 3 manquée", async () => {
    await refused(`UPDATE "Referral" SET version = 2, "step2At" = now() WHERE id = 'r2'`, /Referral_steps_check/);
    await refused(`UPDATE "Referral" SET version = 2, "step1At" = now(), "step3At" = now() WHERE id = 'r2'`, /Referral_steps_check/);
    await pg.exec(`UPDATE "Referral" SET version = 2, "step1At" = now(), "step2At" = now(), "step4At" = now() WHERE id = 'r2'`);
    await refused(`UPDATE "Referral" SET version = 3 WHERE id = 'r2'`, /Referral_version_check/);
  });

  it("blocage, décision et révocation vont ensemble", async () => {
    await refused(`UPDATE "Referral" SET "heldAt" = now() WHERE id = 'r2'`, /Referral_hold_check/);
    await pg.exec(`UPDATE "Referral" SET "heldAt" = now(), "holdReason" = 'DEVICE', "holdEvidence" = '{"device": true}' WHERE id = 'r2'`);
    await refused(`UPDATE "Referral" SET "reviewedAt" = now(), "reviewDecision" = 'REVOKED' WHERE id = 'r2'`, /Referral_revoke_check/);
    await refused(`UPDATE "Referral" SET "reviewedAt" = now(), "reviewDecision" = 'VALIDATED', "revokedAt" = now() WHERE id = 'r2'`, /Referral_revoke_check/);
    await refused(`UPDATE "Referral" SET "reviewDecision" = 'VALIDATED' WHERE id = 'r2'`, /Referral_review_check/);
    await pg.exec(`UPDATE "Referral" SET "reviewedAt" = now(), "reviewedById" = 'other', "reviewDecision" = 'VALIDATED' WHERE id = 'r2'`);
    await refused(`UPDATE "Referral" SET score = -1 WHERE id = 'r2'`, /Referral_score_check/);
  });

  it("un seul versement par étape et par côté, par palier non repris et par grand-parrainage", async () => {
    const reward = (id: string, cols: string, values: string) =>
      pg.exec(`INSERT INTO "ReferralReward" (id, "referralId", "userId", kind, granted${cols}) VALUES ('${id}', 'r2', 'par', ${values})`);
    await reward("w1", `, side, step`, `'STEP', '{}', 'REFERRER', 1`);
    await expect(reward("w2", `, side, step`, `'STEP', '{}', 'REFERRER', 1`)).rejects.toThrow(/ReferralReward_step_once/);
    await reward("w3", `, side, step`, `'STEP', '{}', 'REFEREE', 1`);
    await reward("w4", `, side, step`, `'TRUST_BONUS', '{}', 'REFERRER', 1`);
    await expect(reward("w5", `, side, step`, `'TRUST_BONUS', '{}', 'REFERRER', 3`)).rejects.toThrow(/ReferralReward_shape_check/);
    await expect(reward("w6", ``, `'STEP', '{}'`)).rejects.toThrow(/ReferralReward_shape_check/);
    await reward("m1", `, milestone`, `'MILESTONE', '{"zeni": 0}', 3`);
    await expect(reward("m2", `, milestone`, `'MILESTONE', '{}', 3`)).rejects.toThrow(/ReferralReward_milestone_once/);
    // Un palier repris peut être de nouveau atteint
    await pg.exec(`UPDATE "ReferralReward" SET "clawedBackAt" = now() WHERE id = 'm1'`);
    await reward("m3", `, milestone`, `'MILESTONE', '{}', 3`);
    await reward("g1", ``, `'GRAND', '{}'`);
    await expect(reward("g2", ``, `'GRAND', '{}'`)).rejects.toThrow(/ReferralReward_grand_once/);
    await expect(reward("x1", `, milestone`, `'MILESTONE', '[]', 5`)).rejects.toThrow(/ReferralReward_granted_check/);
  });

  it("empreinte unique, gardée avec le journal quand le parrainage disparaît", async () => {
    await pg.exec(`INSERT INTO "RefereeFingerprint" (kind, hash, "referralId") VALUES ('DISCORD', '${HASH}', 'r2')`);
    await refused(`INSERT INTO "RefereeFingerprint" (kind, hash) VALUES ('DISCORD', '${HASH}')`, /RefereeFingerprint_pkey/);
    await pg.exec(`INSERT INTO "RefereeFingerprint" (kind, hash) VALUES ('EMAIL', '${HASH}')`);
    await refused(`INSERT INTO "RefereeFingerprint" (kind, hash) VALUES ('EMAIL', 'pas-un-hash')`, /RefereeFingerprint_hash_check/);
    await pg.exec(`DELETE FROM "User" WHERE id = 'ref2'`);
    expect(await rows(`SELECT count(*)::int AS n FROM "Referral" WHERE id = 'r2'`)).toEqual([{ n: 0 }]);
    expect(await rows(`SELECT kind, "referralId" FROM "RefereeFingerprint" ORDER BY kind`)).toEqual([
      { kind: "DISCORD", referralId: null },
      { kind: "EMAIL", referralId: null },
    ]);
    expect(await rows(`SELECT count(*)::int AS n FROM "ReferralReward" WHERE "referralId" IS NULL`)).toEqual([{ n: 6 }]);
  });

  it("un bon utilisé porte sa carte", async () => {
    await pg.exec(`INSERT INTO "Voucher" (id, "userId", kind) VALUES ('v1', 'par', 'MYTHIC_CHOICE')`);
    await refused(`UPDATE "Voucher" SET "usedAt" = now() WHERE id = 'v1'`, /Voucher_used_check/);
  });

  it("la clé étrangère vers l'exemplaire est indexée : supprimer des exemplaires ne parcourt pas tous les bons", async () => {
    expect(await rows(`SELECT indexdef FROM pg_indexes WHERE indexname = 'Voucher_userCardId_idx'`)).toEqual([
      { indexdef: 'CREATE INDEX "Voucher_userCardId_idx" ON public."Voucher" USING btree ("userCardId")' },
    ]);
  });

  it("une seule proposition d'Ambassadeur ouverte par joueur", async () => {
    await pg.exec(`INSERT INTO "AmbassadorProposal" (id, "userId", installed) VALUES ('p1', 'par', 25)`);
    await refused(`INSERT INTO "AmbassadorProposal" (id, "userId", installed) VALUES ('p2', 'par', 26)`, /AmbassadorProposal_userId_open/);
    await refused(`UPDATE "AmbassadorProposal" SET "decidedAt" = now() WHERE id = 'p1'`, /AmbassadorProposal_decision_check/);
    await pg.exec(`UPDATE "AmbassadorProposal" SET "decidedAt" = now(), "decidedById" = 'other', accepted = false WHERE id = 'p1'`);
    await pg.exec(`INSERT INTO "AmbassadorProposal" (id, "userId", installed) VALUES ('p3', 'par', 30)`);
  });

  it("les nouvelles valeurs des motifs Zeni et des notifications existent", async () => {
    expect(await rows(`SELECT 'REFERRAL_CLAWBACK'::"CoinReason" AS r, 'REFERRAL_REWARD'::"NotificationType" AS n`)).toEqual([
      { r: "REFERRAL_CLAWBACK", n: "REFERRAL_REWARD" },
    ]);
  });
});
