import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { createPgAdapter } from "@/server/pg-adapter";
import { referralTreeOf } from "./tree";

// Arbre des liens sur une vraie base (base de test isolée) : sauté sans DATABASE_URL_TEST.
//   DATABASE_URL_TEST="postgresql://…" npx vitest run server/referral/tree.db.test.ts
// Seuls les amis installés comptent (ni en route, ni bloqués, ni révoqués, ni bannis), sur deux niveaux ; un profil qui
// n'est pas public reste anonyme, sauf pour lui-même ; l'arbre masqué le reste.

const url = process.env.DATABASE_URL_TEST;
const shared = vi.hoisted(() => ({ prisma: null as unknown }));

vi.mock("server-only", () => ({}));
vi.mock("../db", () => ({
  get prisma() {
    return shared.prisma;
  },
}));

describe.skipIf(!url)("arbre des liens (base réelle)", () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  const tag = randomBytes(3).toString("hex");
  const names = ["papi", "moi", "lea", "secret", "route", "bloque", "revoque", "banni", "petit"] as const;
  const users = {} as Record<(typeof names)[number], string>;
  const T = new Date(Date.now() - 10 * 86_400_000);

  beforeAll(async () => {
    shared.prisma = prisma;
    for (const name of names) {
      users[name] = (
        await prisma.user.create({
          data: {
            username: `test-arbre-${name}-${tag}`,
            isGuest: false,
            profileVisibility: name === "secret" ? "PRIVATE" : "PUBLIC",
            titleAgreement: name === "papi" ? "FEM" : "MASC",
            bannedAt: name === "banni" ? T : null,
          },
          select: { id: true },
        })
      ).id;
    }
    const link = (referrer: keyof typeof users, referee: keyof typeof users, extra: Record<string, unknown> = {}) =>
      prisma.referral.create({ data: { referrerId: users[referrer], refereeId: users[referee], version: 2, step1At: T, step2At: T, ...extra }, select: { id: true } });
    await link("papi", "moi", { step2At: null });
    await link("moi", "lea");
    await link("moi", "secret", { step2At: new Date(T.getTime() + 1000) });
    await link("moi", "route", { step2At: null });
    await link("moi", "bloque", { heldAt: T, holdReason: "DEVICE" });
    await link("moi", "revoque", { revokedAt: T, reviewedAt: T, reviewDecision: "REVOKED" });
    await link("moi", "banni");
    await link("lea", "petit");
  }, 30_000);

  afterAll(async () => {
    const ids = Object.values(users);
    await prisma.$transaction([
      prisma.referral.deleteMany({ where: { OR: [{ referrerId: { in: ids } }, { refereeId: { in: ids } }] } }),
      prisma.user.deleteMany({ where: { id: { in: ids } } }),
    ]);
    await prisma.$disconnect();
  }, 30_000);

  it("parrain, amis installés et les leurs ; un profil privé reste anonyme pour les autres", async () => {
    const tree = await referralTreeOf(users.moi, null);
    expect(tree.hidden).toBe(false);
    expect(tree.up).toMatchObject({ name: `test-arbre-papi-${tag}`, fem: true });
    expect(tree.kids.map((k) => k.node.name)).toEqual([`test-arbre-lea-${tag}`, null]);
    expect(tree.kids[0].kids.map((g) => g.name)).toEqual([`test-arbre-petit-${tag}`]);
    expect(tree.counts).toEqual({ kids: 2, grandkids: 1 });
  });

  it("le joueur au profil privé se voit, lui", async () => {
    const tree = await referralTreeOf(users.moi, users.secret);
    expect(tree.kids.map((k) => k.node.name)).toEqual([`test-arbre-lea-${tag}`, `test-arbre-secret-${tag}`]);
  });

  it("l'arbre masqué le dit", async () => {
    await prisma.user.update({ where: { id: users.moi }, data: { referralTreeHidden: true } });
    expect((await referralTreeOf(users.moi, null)).hidden).toBe(true);
  });
});
