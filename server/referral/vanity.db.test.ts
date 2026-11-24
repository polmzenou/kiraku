import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { createPgAdapter } from "@/server/pg-adapter";
import { setVanityCodeWith, VanityError, vanityStatusWith } from "./vanity-core";

vi.mock("server-only", () => ({}));

// Codes perso posés par l'équipe, sur une vraie base (base de test isolée) : sauté sans DATABASE_URL_TEST.
//   DATABASE_URL_TEST="postgresql://…" npx vitest run server/referral/vanity.db.test.ts
// Seule l'équipe pose un code ; un code ne désigne jamais deux joueurs, même posé deux fois en même temps ; la forme
// d'un code standard est refusée ; chaque pose et chaque retrait sont journalisés.

const url = process.env.DATABASE_URL_TEST;

describe.skipIf(!url)("codes perso (base réelle)", () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  const tag = randomBytes(3).toString("hex").toUpperCase();
  const users: Record<"dev" | "a" | "b" | "c" | "outsider", string> = { dev: "", a: "", b: "", c: "", outsider: "" };
  const outcome = (p: Promise<unknown>) => p.then(() => "OK", (e: unknown) => (e instanceof VanityError ? e.code : String(e)));
  const codeOf = async (id: string) => (await prisma.user.findUniqueOrThrow({ where: { id }, select: { vanityCode: true } })).vanityCode;

  beforeAll(async () => {
    for (const name of Object.keys(users) as (keyof typeof users)[]) {
      users[name] = (await prisma.user.create({ data: { username: `test-van-${name}-${tag}`, isGuest: false, role: name === "dev" ? "DEV" : "USER" }, select: { id: true } })).id;
    }
  }, 30_000);

  afterAll(async () => {
    const ids = Object.values(users).filter(Boolean);
    await prisma.$transaction([prisma.adminLog.deleteMany({ where: { adminId: { in: ids } } }), prisma.user.deleteMany({ where: { id: { in: ids } } })]);
    await prisma.$disconnect();
  }, 30_000);

  it("l'équipe pose un code, en forme canonique, et le journal le dit ; personne d'autre ne le peut", async () => {
    const code = `kiri-${tag}`;
    expect(await outcome(setVanityCodeWith(prisma, { staffId: users.outsider, userId: users.a, code }))).toBe("FORBIDDEN");
    expect(await setVanityCodeWith(prisma, { staffId: users.dev, userId: users.a, code })).toEqual({ code: `KIRI${tag}`, previous: null });
    expect(await codeOf(users.a)).toBe(`KIRI${tag}`);
    const log = await prisma.adminLog.findFirstOrThrow({ where: { adminId: users.dev, targetId: users.a }, select: { action: true, after: true } });
    expect(log).toEqual({ action: "REFERRAL_VANITY_SET", after: { code: `KIRI${tag}` } });
    expect(await vanityStatusWith(prisma, `KIRI${tag}`, users.a)).toBe("FREE");
    expect(await vanityStatusWith(prisma, `KIRI${tag}`, users.b)).toBe("TAKEN");
  });

  it("refuse un code déjà pris, de mauvaise forme ou de la forme d'un code standard", async () => {
    expect(await outcome(setVanityCodeWith(prisma, { staffId: users.dev, userId: users.b, code: `KIRI${tag}` }))).toBe("TAKEN");
    expect(await outcome(setVanityCodeWith(prisma, { staffId: users.dev, userId: users.b, code: "AB" }))).toBe("FORMAT");
    expect(await outcome(setVanityCodeWith(prisma, { staffId: users.dev, userId: users.b, code: "H8V95ZAU" }))).toBe("STANDARD_SHAPE");
    expect(await codeOf(users.b)).toBeNull();
  });

  it("le même code posé en même temps sur deux joueurs : un seul l'obtient", async () => {
    const code = `DUO${tag}`;
    const results = await Promise.all([
      outcome(setVanityCodeWith(prisma, { staffId: users.dev, userId: users.b, code })),
      outcome(setVanityCodeWith(prisma, { staffId: users.dev, userId: users.c, code })),
    ]);
    expect(results.sort()).toEqual(["OK", "TAKEN"]);
    expect(await prisma.user.count({ where: { vanityCode: code } })).toBe(1);
  });

  it("retirer le code le libère pour un autre joueur", async () => {
    expect(await setVanityCodeWith(prisma, { staffId: users.dev, userId: users.a, code: null })).toEqual({ code: null, previous: `KIRI${tag}` });
    expect(await codeOf(users.a)).toBeNull();
    expect(await outcome(setVanityCodeWith(prisma, { staffId: users.dev, userId: users.c, code: `KIRI${tag}` }))).toBe("OK");
  });
});
