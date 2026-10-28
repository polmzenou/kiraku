import type { PrismaClient } from "@/generated/prisma/client";
import { describe, expect, it, vi } from "vitest";
import { MAX_ADMIN_VALUE } from "@/lib/admin/users";
import { mutateAdminUserWith } from "./users-core";

const base = { userId: "player", reason: "Correction" };
const target = {
  id: "player", username: "Player", role: "USER", bannedAt: null, profileVisibility: "PUBLIC", showCollection: true,
  coins: 500, boosterStock: 2, boosterAnchor: new Date(0), rankPoints: 0, pityCount: 3, standardCount: 4, bannerPity: {}, battleTeam: [],
  ambassadorSince: null as Date | null, titleId: null as string | null, frameId: "frame-hisui" as string | null, nameColorId: "color-lime" as string | null,
  leaderboardHiddenAt: null as Date | null,
};

function setup({ role = "ADMIN", banned = false, exists = true, player = {} as Partial<typeof target> } = {}) {
  const tx = {
    $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join("?");
      if (sql.includes('UPDATE "User" SET coins')) return [{ coins: target.coins + Number(values[0]) }];
      return [];
    }),
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => where.id === "admin" ? { ...target, id: "admin", role, bannedAt: banned ? new Date() : null } : exists ? { ...target, ...player } : null),
      findFirst: vi.fn().mockResolvedValue(null), update: vi.fn(),
    },
    coinTransaction: { createMany: vi.fn() },
    adminLog: { create: vi.fn() },
    session: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) },
    boosterType: { findUnique: vi.fn().mockResolvedValue({ id: "type" }) },
    boosterCredit: { findUnique: vi.fn().mockResolvedValue({ count: 5 }), upsert: vi.fn() },
    card: { findUnique: vi.fn().mockResolvedValue({ id: "card" }), count: vi.fn().mockResolvedValue(100) },
    userCard: { count: vi.fn().mockResolvedValue(3), createMany: vi.fn(), findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn() },
    discovery: { createMany: vi.fn(), count: vi.fn().mockResolvedValue(3) },
    wishlistEntry: { findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn() },
    teamGift: { create: vi.fn().mockResolvedValue({ id: "gift" }) },
    notification: { create: vi.fn().mockResolvedValue({ id: "notif" }) },
    gameSetting: { findMany: vi.fn().mockResolvedValue([]) },
    // Seul le cadre porté est réservé aux ambassadeurs
    cosmetic: { findMany: vi.fn().mockResolvedValue([{ id: "frame-hisui" }]) },
  };
  const db = { $transaction: vi.fn(async (run: (client: typeof tx) => Promise<unknown>) => run(tx)) } as unknown as PrismaClient;
  return { tx, db };
}

describe("mutations admin atomiques", () => {
  it.each([{ role: "USER" }, { banned: true }])("revérifie les droits sous verrou (%o)", async (state) => {
    const { tx, db } = setup(state);
    await expect(mutateAdminUserWith(db, "admin", { ...base, kind: "coins", mode: "ADD", amount: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(tx.adminLog.create).not.toHaveBeenCalled();
    expect(tx.coinTransaction.createMany).not.toHaveBeenCalled();
  });
  it("retourne une erreur si le joueur a disparu", async () => {
    const { db } = setup({ exists: false });
    await expect(mutateAdminUserWith(db, "admin", { ...base, kind: "stat", field: "rankPoints", value: 10 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("verrouille les joueurs dans l'ordre puis écrit solde, journal et audit ensemble", async () => {
    const { tx, db } = setup();
    await mutateAdminUserWith(db, "admin", { ...base, kind: "coins", mode: "SET", amount: MAX_ADMIN_VALUE });
    const locks = tx.$queryRaw.mock.calls.slice(0, 2);
    expect(locks.map((c) => c[1])).toEqual(["admin", "player"]);
    expect(locks.every((c) => c[0].join("").includes("FOR UPDATE"))).toBe(true);
    const data = tx.coinTransaction.createMany.mock.calls[0][0].data;
    expect(data.every((e: { amount: number; reason: string }) => e.amount <= 100_000_000 && e.reason === "ADMIN")).toBe(true);
    expect(data.reduce((sum: number, e: { amount: number }) => sum + e.amount, 0)).toBe(MAX_ADMIN_VALUE - 500);
    expect(data.at(-1).balanceAfter).toBe(MAX_ADMIN_VALUE);
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.adminLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ adminId: "admin", targetId: "player", before: { coins: 500 }, after: { values: { coins: MAX_ADMIN_VALUE }, reason: "Correction" } }) });
  });
  it("refuse un retrait trop élevé sans écrire de mouvement", async () => {
    const { tx, db } = setup();
    await expect(mutateAdminUserWith(db, "admin", { ...base, kind: "coins", mode: "REMOVE", amount: 501 })).rejects.toMatchObject({ code: "INSUFFICIENT" });
    expect(tx.coinTransaction.createMany).not.toHaveBeenCalled();
    expect(tx.adminLog.create).not.toHaveBeenCalled();
  });
  it("ne crée pas de ligne de Zeni nulle", async () => {
    const { tx, db } = setup();
    await mutateAdminUserWith(db, "admin", { ...base, kind: "coins", mode: "SET", amount: 500 });
    expect(tx.coinTransaction.createMany).not.toHaveBeenCalled();
  });
  it("protège l'administrateur contre son propre bannissement", async () => {
    const { tx, db } = setup();
    await expect(mutateAdminUserWith(db, "admin", { ...base, userId: "admin", kind: "account", username: "Admin", role: "ADMIN", banned: true, profileVisibility: "PUBLIC", showCollection: true })).rejects.toMatchObject({ code: "SELF_PROTECTED" });
    expect(tx.user.update).not.toHaveBeenCalled();
  });
  it("ferme les sessions lors d'un bannissement", async () => {
    const { tx, db } = setup();
    await mutateAdminUserWith(db, "admin", { ...base, kind: "account", username: "Player", role: "USER", banned: true, profileVisibility: "PRIVATE", showCollection: false });
    expect(tx.session.deleteMany).toHaveBeenCalledWith({ where: { userId: "player" } });
    expect(tx.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ bannedAt: expect.any(Date) }) }));
  });
  it("ajoute des cartes sans doublonner leur découverte", async () => {
    const { tx, db } = setup();
    await mutateAdminUserWith(db, "admin", { ...base, kind: "card", cardId: "card", mode: "ADD", amount: 3, message: null });
    expect(tx.userCard.createMany.mock.calls[0][0].data).toHaveLength(3);
    expect(tx.discovery.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ userId: "player", cardId: "card" })], skipDuplicates: true });
  });
  it("notifie le joueur d'un ajout, avec le mot de l'équipe", async () => {
    const { tx, db } = setup();
    const notified = vi.fn();
    await mutateAdminUserWith(db, "admin", { ...base, kind: "card", cardId: "card", mode: "ADD", amount: 2, message: "Récompense événement" }, notified);
    expect(tx.teamGift.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: "player", adminId: "admin", kind: "CARD", cardId: "card", quantity: 2, message: "Récompense événement" }),
    }));
    expect(tx.notification.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: "player", type: "TEAM_GIFT", refId: "gift", payload: { kind: "CARD", cardId: "card", quantity: 2 } }),
    }));
    expect(notified).toHaveBeenCalledWith(["notif"]);
  });
  it("ne notifie ni un retrait ni un crédit fixé", async () => {
    const { tx, db } = setup();
    await mutateAdminUserWith(db, "admin", { ...base, kind: "booster", boosterTypeId: "type", mode: "SET", amount: 3, message: null });
    expect(tx.teamGift.create).not.toHaveBeenCalled();
    expect(tx.notification.create).not.toHaveBeenCalled();
  });
  it("refuse de retirer une carte protégée", async () => {
    const { tx, db } = setup();
    await expect(mutateAdminUserWith(db, "admin", { ...base, kind: "card", cardId: "card", mode: "REMOVE", amount: 1, message: null })).rejects.toMatchObject({ code: "CARDS_LOCKED" });
    expect(tx.userCard.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ ownerId: "player", status: "COLLECTION", showcase: null, auctions: { none: {} } }) }));
    expect(tx.userCard.deleteMany).not.toHaveBeenCalled();
  });
  it("définit les crédits d'un type existant, même inactif", async () => {
    const { tx, db } = setup();
    await mutateAdminUserWith(db, "admin", { ...base, kind: "booster", boosterTypeId: "type", mode: "ADD", amount: 7, message: null });
    expect(tx.boosterCredit.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { count: 12 } }));
    tx.boosterType.findUnique.mockResolvedValueOnce(null);
    await expect(mutateAdminUserWith(db, "admin", { ...base, kind: "booster", boosterTypeId: "missing", mode: "SET", amount: 1, message: null })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("empêche d'effacer les découvertes des cartes possédées", async () => {
    const { tx, db } = setup();
    await expect(mutateAdminUserWith(db, "admin", { ...base, kind: "discoveries", value: 0 })).rejects.toMatchObject({ code: "DISCOVERY_MIN" });
    expect(tx.adminLog.create).not.toHaveBeenCalled();
  });
});

describe("rôle Ambassadeur", () => {
  it("donne le rôle, arrête le stock au max commun et notifie le joueur", async () => {
    const { tx, db } = setup({ player: { boosterStock: 10, boosterAnchor: new Date(0) } });
    await mutateAdminUserWith(db, "admin", { ...base, kind: "ambassador", ambassador: true });
    const data = tx.user.update.mock.calls[0][0].data;
    expect(data.ambassadorSince).toBeInstanceOf(Date);
    // Plein à 10 avec une vieille ancre : le cycle vers 15 repart de maintenant
    expect(data.boosterStock).toBe(10);
    expect(data.boosterAnchor.getTime()).toBeGreaterThan(0);
    expect(tx.cosmetic.findMany).not.toHaveBeenCalled();
    expect(tx.notification.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: "AMBASSADOR_GRANTED", userId: "player" }) }));
    expect(tx.adminLog.create.mock.calls[0][0].data.action).toBe("USER_AMBASSADOR");
  });

  it("retire le rôle et les cosmétiques réservés portés, sans notifier", async () => {
    const since = new Date("2026-10-01");
    const { tx, db } = setup({ player: { ambassadorSince: since, boosterStock: 13, boosterAnchor: new Date() } });
    await mutateAdminUserWith(db, "admin", { ...base, kind: "ambassador", ambassador: false });
    const data = tx.user.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ ambassadorSince: null, boosterStock: 13, frameId: null });
    expect(data).not.toHaveProperty("nameColorId");
    expect(tx.notification.create).not.toHaveBeenCalled();
  });

  it("garde la date d'origine si le rôle est redonné", async () => {
    const since = new Date("2026-10-01");
    const { tx, db } = setup({ player: { ambassadorSince: since } });
    await mutateAdminUserWith(db, "admin", { ...base, kind: "ambassador", ambassador: true });
    expect(tx.user.update.mock.calls[0][0].data.ambassadorSince).toEqual(since);
    expect(tx.notification.create).not.toHaveBeenCalled();
  });
});

describe("classement des collectionneurs", () => {
  it("retire le joueur du classement sans toucher à son profil, et le journalise", async () => {
    const { tx, db } = setup();
    await mutateAdminUserWith(db, "admin", { ...base, kind: "leaderboard", hidden: true });
    const { data } = tx.user.update.mock.calls[0][0];
    expect(Object.keys(data)).toEqual(["leaderboardHiddenAt"]);
    expect(data.leaderboardHiddenAt).toBeInstanceOf(Date);
    const log = tx.adminLog.create.mock.calls[0][0].data;
    expect(log.action).toBe("USER_LEADERBOARD");
    expect(log.before).toEqual({ hidden: false });
  });

  it("garde la date d'origine d'un retrait déjà posé", async () => {
    const since = new Date("2026-10-01");
    const { tx, db } = setup({ player: { leaderboardHiddenAt: since } });
    await mutateAdminUserWith(db, "admin", { ...base, kind: "leaderboard", hidden: true });
    expect(tx.user.update.mock.calls[0][0].data.leaderboardHiddenAt).toEqual(since);
  });

  it("remet le joueur dans le classement", async () => {
    const { tx, db } = setup({ player: { leaderboardHiddenAt: new Date("2026-10-01") } });
    await mutateAdminUserWith(db, "admin", { ...base, kind: "leaderboard", hidden: false });
    expect(tx.user.update.mock.calls[0][0].data).toEqual({ leaderboardHiddenAt: null });
  });
});
