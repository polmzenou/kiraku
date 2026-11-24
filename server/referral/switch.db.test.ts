import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { upsertReferralV2Seeds } from "@/prisma/seed/referral-v2";
import { createPgAdapter } from "@/server/pg-adapter";
import { fingerprintKey, refereeFingerprints } from "./fingerprint";
import { switchToReferralV2With } from "./switch-core";

vi.mock("server-only", () => ({}));

// Bascule vers le parrainage v2 sur une vraie base (base de test isolée) : sauté sans DATABASE_URL_TEST.
//   DATABASE_URL_TEST="postgresql://…" npx vitest run server/referral/switch.db.test.ts
// Les v1 en attente deviennent des v2, les v1 qualifiés restent, chaque filleul garde son empreinte ; relancée, la
// bascule ne change plus rien. Le seed ne touche pas un réglage déjà choisi.

const url = process.env.DATABASE_URL_TEST;
const KEY = fingerprintKey("secret-de-test-assez-long-pour-auth-secret");

describe.skipIf(!url)("bascule vers le parrainage v2 (base réelle)", () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  const tag = randomBytes(3).toString("hex");
  const ids: Record<string, string> = {};
  const emails: string[] = [];
  const created = new Date("2026-11-01T10:00:00Z");

  beforeAll(async () => {
    for (const name of ["papi", "par", "attente", "qualifie"]) {
      const email = `${name}.${tag}@exemple.fr`;
      emails.push(email);
      ids[name] = (await prisma.user.create({ data: { username: `test-sw-${name}-${tag}`, isGuest: false, email }, select: { id: true } })).id;
    }
    await prisma.user.update({ where: { id: ids.par }, data: { referredById: ids.papi } });
    await prisma.referral.createMany({
      data: [
        { id: `r-par-${tag}`, referrerId: ids.papi, refereeId: ids.par, status: "QUALIFIED", qualifiedAt: created, createdAt: created },
        { id: `r-att-${tag}`, referrerId: ids.par, refereeId: ids.attente, status: "PENDING", createdAt: created },
        { id: `r-qua-${tag}`, referrerId: ids.par, refereeId: ids.qualifie, status: "QUALIFIED", qualifiedAt: created, createdAt: created },
      ],
    });
  }, 30_000);

  afterAll(async () => {
    const users = Object.values(ids);
    const prints = emails.flatMap((email) => refereeFingerprints({ discordId: null, email }, KEY));
    await prisma.$transaction([
      prisma.refereeFingerprint.deleteMany({ where: { OR: prints.map((p) => ({ kind: p.kind, hash: p.hash })) } }),
      prisma.referral.deleteMany({ where: { refereeId: { in: users } } }),
      prisma.user.deleteMany({ where: { id: { in: users } } }),
    ]);
    await prisma.$disconnect();
  }, 30_000);

  it("convertit les v1 en attente, garde les qualifiés, pose les empreintes ; relancée, ne change plus rien", async () => {
    const first = await switchToReferralV2With(prisma, { key: KEY });
    expect(first.converted).toBeGreaterThanOrEqual(1);
    const rows = await prisma.referral.findMany({ where: { refereeId: { in: [ids.attente, ids.qualifie] } }, select: { refereeId: true, version: true, grandReferrerId: true } });
    expect(rows.find((r) => r.refereeId === ids.attente)).toMatchObject({ version: 2, grandReferrerId: ids.papi });
    expect(rows.find((r) => r.refereeId === ids.qualifie)).toMatchObject({ version: 1 });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ids.attente }, select: { referredAt: true } })).referredAt).toEqual(created);
    const prints = emails.slice(1).flatMap((email) => refereeFingerprints({ discordId: null, email }, KEY));
    expect(await prisma.refereeFingerprint.count({ where: { OR: prints.map((p) => ({ kind: p.kind, hash: p.hash })) } })).toBe(3);

    const again = await switchToReferralV2With(prisma, { key: KEY });
    expect(await prisma.referral.count({ where: { refereeId: { in: [ids.attente, ids.qualifie] }, version: 2 } })).toBe(1);
    expect(again.converted).toBe(0);
  });

  it("le seed n'écrase pas un réglage déjà choisi dans l'admin", async () => {
    const keys = ["referral.v2.stepLots", "referral.v2.grandLotId", "referral.v2.milestones"];
    const before = await prisma.gameSetting.findMany({ where: { key: { in: keys } } });
    const key = "referral.v2.grandLotId";
    await prisma.gameSetting.upsert({ where: { key }, create: { key, value: "lot-choisi" }, update: { value: "lot-choisi" } });
    try {
      await upsertReferralV2Seeds(prisma);
      expect((await prisma.gameSetting.findUniqueOrThrow({ where: { key } })).value).toBe("lot-choisi");
    } finally {
      // La base de test retrouve ses réglages d'avant
      await prisma.gameSetting.deleteMany({ where: { key: { in: keys } } });
      for (const row of before) await prisma.gameSetting.create({ data: { key: row.key, value: row.value as never, updatedBy: row.updatedBy } });
    }
  });
});
