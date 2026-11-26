import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { DEFAULT_REFERRAL_V2_RULES, type ReferralV2Rules } from "@/lib/referral/rules";
import { SETTING_DEFAULTS, type SettingKey } from "@/lib/settings/defaults";
import { createPgAdapter } from "@/server/pg-adapter";

// Fil du parrainage dans le salon privé de l'équipe, sur base réelle : mise en file des événements récents, un message
// par étape versée (les deux côtés ensemble), « À vérifier », décision, dans l'ordre d'arrivée et jamais deux fois.
// Discord est simulé : on lit ce qui serait publié.

const url = process.env.DATABASE_URL_TEST;
const CHANNEL = "123456789012345678";
const shared = vi.hoisted(() => {
  // server/env.ts valide l'environnement à l'import (relu tel quel, sauf le salon du parrainage)
  process.env.DATABASE_URL ??= process.env.DATABASE_URL_TEST ?? "postgresql://test@localhost/test";
  process.env.AUTH_SECRET ??= "secret-de-test-assez-long-pour-auth-secret";
  return {
    prisma: null as unknown,
    rules: null as unknown,
    published: [] as { key: string; payload: { embeds?: { title?: string; fields?: { name: string; value: string }[] }[] } }[],
  };
});

vi.mock("server-only", () => ({}));
vi.mock("../db", () => ({
  get prisma() {
    return shared.prisma;
  },
}));
vi.mock("../env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../env")>();
  return { ...actual, env: { ...actual.env, DISCORD_REFERRAL_CHANNEL_ID: "123456789012345678" }, discordReferralConfigured: true, appUrl: () => "https://kiraku.example" };
});
vi.mock("../settings", () => ({ getSetting: async (key: SettingKey) => SETTING_DEFAULTS[key] }));
vi.mock("../catalog/rarities", () => ({ getRarityDefinitions: async () => [] }));
vi.mock("../referral/deps", () => ({ referralV2Rules: async () => shared.rules }));
vi.mock("./private-channel", () => ({ assertPrivateDiscordChannel: async () => undefined }));
vi.mock("./posts", () => ({
  publishDiscordPost: async (key: string, payload: (typeof shared.published)[number]["payload"]) => {
    shared.published.push({ key, payload });
    await (shared.prisma as PrismaClient).discordPost.updateMany({ where: { key }, data: { messageId: "1", nextAttemptAt: null } });
    return { ok: true, messageId: "1" };
  },
  dropDiscordPost: async (key: string) => {
    await (shared.prisma as PrismaClient).discordPost.updateMany({ where: { key, messageId: null }, data: { nextAttemptAt: null } });
  },
}));

const { syncDiscordReferrals } = await import("./referral-feed");
const { payDueRewardsWith } = await import("../referral/payout-core");

const HOUR = 3_600_000;

describe.skipIf(!url)("fil Discord du parrainage (base réelle)", () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  shared.prisma = prisma;
  const tag = randomBytes(3).toString("hex");
  const users: Record<string, string> = {};
  const lots: string[] = [];
  const referrals: Record<string, string> = {};
  let logId = "";
  const now = new Date();

  beforeAll(async () => {
    for (const name of ["par", "lea", "max"]) {
      const u = await prisma.user.create({
        data: { username: `test-feed-${name}-${tag}`, isGuest: false, email: `feed-${name}-${tag}@exemple.fr`, emailVerified: now, registeredAt: new Date(now.getTime() - 5 * HOUR) },
        select: { id: true },
      });
      users[name] = u.id;
    }
    const lot = async (zeni: number) => {
      const id = (await prisma.lot.create({ data: { name: { fr: `test-feed-${zeni}-${tag}`, en: "" }, zeni }, select: { id: true } })).id;
      lots.push(id);
      return id;
    };
    const rules: ReferralV2Rules = {
      ...DEFAULT_REFERRAL_V2_RULES,
      enabled: true,
      stepLots: [
        { referee: await lot(101), referrer: await lot(102), referrerTrust: await lot(103) },
        { referee: null, referrer: null, referrerTrust: null },
        { referee: null, referrer: null, referrerTrust: null },
        { referee: null, referrer: null, referrerTrust: null },
      ],
      grandLotId: null,
      milestones: [],
    };
    shared.rules = rules;

    // Léa : étape 1 atteinte il y a 3 h, versée des deux côtés (confiance moyenne : la part « confiance » attend)
    const stepAt = new Date(now.getTime() - 3 * HOUR);
    referrals.lea = (
      await prisma.referral.create({ data: { referrerId: users.par, refereeId: users.lea, version: 2, createdAt: stepAt, step1At: stepAt }, select: { id: true } })
    ).id;
    const deps = { rules, now: stepAt, sharedCap: 4, lotDeps: { rng: () => 0, loadPool: async () => ({ COMMON: [], UNCOMMON: [], RARE: [], EPIC: [], LEGENDARY: [], MYTHIC: [] }) }, timeZone: "Europe/Paris" };
    expect(await payDueRewardsWith(prisma, referrals.lea, deps)).toBe(2);

    // Max : bloqué il y a 2 h (même appareil), puis validé il y a 1 h
    referrals.max = (
      await prisma.referral.create({
        data: {
          referrerId: users.par,
          refereeId: users.max,
          version: 2,
          createdAt: new Date(now.getTime() - 4 * HOUR),
          step1At: new Date(now.getTime() - 4 * HOUR),
          heldAt: new Date(now.getTime() - 2 * HOUR),
          holdReason: "DEVICE",
          holdEvidence: { device: { withReferrer: true, siblings: [] }, score: { value: 72, reasons: [{ kind: "ip", values: ["203.0.113.7"] }] } },
          score: 72,
        },
        select: { id: true },
      })
    ).id;
    logId = (
      await prisma.adminLog.create({
        data: { adminId: users.par, action: "REFERRAL_VALIDATE", targetType: "Referral", targetId: referrals.max, after: { note: null }, createdAt: new Date(now.getTime() - HOUR) },
        select: { id: true },
      })
    ).id;
  }, 60_000);

  afterAll(async () => {
    const ids = Object.values(users);
    await prisma.$transaction([
      prisma.discordPost.deleteMany({ where: { OR: Object.values(referrals).map((id) => ({ key: { contains: id } })).concat([{ key: { contains: logId || "none" } }]) } }),
      prisma.adminLog.deleteMany({ where: { id: logId } }),
      prisma.notification.deleteMany({ where: { userId: { in: ids } } }),
      prisma.referralReward.deleteMany({ where: { userId: { in: ids } } }),
      prisma.referral.deleteMany({ where: { referrerId: { in: ids } } }),
      prisma.coinTransaction.deleteMany({ where: { userId: { in: ids } } }),
      prisma.lot.deleteMany({ where: { id: { in: lots } } }),
      prisma.user.deleteMany({ where: { id: { in: ids } } }),
    ]);
    await prisma.$disconnect();
  }, 60_000);

  it("une étape versée = un message (les deux côtés), puis « À vérifier » et la décision, dans l'ordre, jamais deux fois", async () => {
    await syncDiscordReferrals(Date.now() + 60_000);
    const mine = () => shared.published.filter((p) => Object.values(referrals).some((id) => p.key.includes(id)) || p.key.includes(logId));
    expect(mine().map((p) => p.key)).toEqual([`referral:step:${referrals.lea}:1`, `referral:hold:${referrals.max}`, `referral:decision:${logId}`]);

    const step = mine()[0].payload.embeds![0];
    const fields = Object.fromEntries(step.fields!.map((f) => [f.name, f.value]));
    expect(step.title).toContain("Étape 1 · Arrivée");
    expect(Object.entries(fields).find(([k]) => k.startsWith("Versé au filleul"))?.[1]).toBe("101 Zeni");
    expect(Object.entries(fields).find(([k]) => k.startsWith("Versé au parrain"))?.[1]).toBe("102 Zeni · part « confiance » gardée pour l'étape 3");

    const hold = JSON.stringify(mine()[1].payload);
    expect(hold).toContain("À vérifier");
    expect(hold).toContain("Même appareil que le parrain");
    expect(hold).not.toContain("203.0.113.7");
    expect(JSON.stringify(mine()[2].payload)).toContain("Parrainage validé");

    // Deuxième passage : rien de nouveau à publier
    const before = mine().length;
    await syncDiscordReferrals(Date.now() + 60_000);
    expect(mine()).toHaveLength(before);
    expect(await prisma.discordPost.count({ where: { channelId: CHANNEL, key: { startsWith: `referral:step:${referrals.lea}` } } })).toBe(1);
  });
});
