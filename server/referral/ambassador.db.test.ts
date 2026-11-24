import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { createPgAdapter } from "@/server/pg-adapter";
import { AmbassadorDecisionError, decideAmbassadorWith } from "./ambassador-core";

vi.mock("server-only", () => ({}));

// Ambassadeurs proposés par le parrainage, sur une vraie base (base de test isolée) : sauté sans DATABASE_URL_TEST.
//   DATABASE_URL_TEST="postgresql://…" npx vitest run server/referral/ambassador.db.test.ts
// Une seule proposition ouverte par joueur ; seule l'équipe (ADMIN ou DEV) décide ; deux décisions simultanées : une
// seule passe ; accepter pose le rôle, prévient le joueur et écrit le journal ; refuser ne touche pas au joueur.

const url = process.env.DATABASE_URL_TEST;

describe.skipIf(!url)("Ambassadeurs proposés (base réelle)", () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  const tag = randomBytes(3).toString("hex");
  const users: Record<"dev" | "admin" | "player" | "other" | "outsider", string> = { dev: "", admin: "", player: "", other: "", outsider: "" };
  const outcome = (p: Promise<unknown>) => p.then(() => "OK", (e: unknown) => (e instanceof AmbassadorDecisionError ? e.code : String(e)));
  const propose = async (userId: string, installed = 25) => (await prisma.ambassadorProposal.create({ data: { userId, installed }, select: { id: true } })).id;

  beforeAll(async () => {
    const roles = { dev: "DEV", admin: "ADMIN", player: "USER", other: "USER", outsider: "USER" } as const;
    for (const [name, role] of Object.entries(roles) as [keyof typeof users, (typeof roles)[keyof typeof roles]][]) {
      users[name] = (await prisma.user.create({ data: { username: `test-amb-${name}-${tag}`, isGuest: false, role }, select: { id: true } })).id;
    }
  }, 30_000);

  afterAll(async () => {
    const ids = Object.values(users).filter(Boolean);
    await prisma.$transaction([
      prisma.adminLog.deleteMany({ where: { adminId: { in: ids } } }),
      prisma.notification.deleteMany({ where: { userId: { in: ids } } }),
      prisma.ambassadorProposal.deleteMany({ where: { userId: { in: ids } } }),
      prisma.user.deleteMany({ where: { id: { in: ids } } }),
    ]);
    await prisma.$disconnect();
  }, 30_000);

  it("une seule proposition ouverte par joueur", async () => {
    await propose(users.other, 25);
    await expect(propose(users.other, 26)).rejects.toThrow();
    expect(await prisma.ambassadorProposal.count({ where: { userId: users.other, decidedAt: null } })).toBe(1);
  });

  it("un joueur hors de l'équipe ne décide pas", async () => {
    const id = (await prisma.ambassadorProposal.findFirstOrThrow({ where: { userId: users.other, decidedAt: null }, select: { id: true } })).id;
    expect(await outcome(decideAmbassadorWith(prisma, { staffId: users.outsider, proposalId: id, accept: true, now: new Date() }))).toBe("FORBIDDEN");
    expect((await prisma.ambassadorProposal.findUniqueOrThrow({ where: { id }, select: { decidedAt: true } })).decidedAt).toBeNull();
  });

  it("accepter et refuser en même temps : une seule décision passe ; accepter pose le rôle et prévient le joueur", async () => {
    const id = await propose(users.player, 25);
    const results = await Promise.all([
      outcome(decideAmbassadorWith(prisma, { staffId: users.dev, proposalId: id, accept: true, now: new Date() })),
      outcome(decideAmbassadorWith(prisma, { staffId: users.admin, proposalId: id, accept: false, now: new Date() })),
    ]);
    expect(results.filter((r) => r === "OK")).toHaveLength(1);
    expect(results.filter((r) => r === "ALREADY_DECIDED")).toHaveLength(1);

    const proposal = await prisma.ambassadorProposal.findUniqueOrThrow({ where: { id }, select: { accepted: true, decidedById: true } });
    const player = await prisma.user.findUniqueOrThrow({ where: { id: users.player }, select: { ambassadorSince: true } });
    const logs = await prisma.adminLog.findMany({ where: { targetType: "AmbassadorProposal", targetId: id }, select: { action: true } });
    expect(logs).toHaveLength(1);
    if (proposal.accepted) {
      // Le DEV a accepté : le rôle est posé, le joueur prévenu, le journal le dit
      expect(proposal.decidedById).toBe(users.dev);
      expect(player.ambassadorSince).not.toBeNull();
      expect(await prisma.notification.count({ where: { userId: users.player, type: "AMBASSADOR_GRANTED" } })).toBe(1);
      expect(logs[0].action).toBe("AMBASSADOR_ACCEPT");
    } else {
      // L'admin a refusé : le joueur n'est pas touché
      expect(proposal.decidedById).toBe(users.admin);
      expect(player.ambassadorSince).toBeNull();
      expect(await prisma.notification.count({ where: { userId: users.player, type: "AMBASSADOR_GRANTED" } })).toBe(0);
      expect(logs[0].action).toBe("AMBASSADOR_REFUSE");
    }
  });

  it("refuser ferme la proposition sans toucher au joueur ; une nouvelle peut ensuite s'ouvrir", async () => {
    const id = (await prisma.ambassadorProposal.findFirstOrThrow({ where: { userId: users.other, decidedAt: null }, select: { id: true } })).id;
    expect(await outcome(decideAmbassadorWith(prisma, { staffId: users.dev, proposalId: id, accept: false, now: new Date() }))).toBe("OK");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: users.other }, select: { ambassadorSince: true } })).ambassadorSince).toBeNull();
    expect(await outcome(decideAmbassadorWith(prisma, { staffId: users.dev, proposalId: id, accept: true, now: new Date() }))).toBe("ALREADY_DECIDED");
    await propose(users.other, 30);
    expect(await prisma.ambassadorProposal.count({ where: { userId: users.other } })).toBe(2);
  });
});
