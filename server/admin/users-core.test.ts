import type { PrismaClient } from "@/generated/prisma/client";
import { describe, expect, it, vi } from "vitest";
import { adminUserMutationSchema, MAX_ADMIN_VALUE } from "@/lib/admin/users";
import { mutateAdminUserWith } from "./users-core";

const base = { userId: "player", reason: "Correction" };
const target = {
  id: "player", username: "Player", role: "USER", bannedAt: null, profileVisibility: "PUBLIC", showCollection: true,
  coins: 500, boosterStock: 2, boosterAnchor: new Date(0), rankPoints: 0, pityCount: 3, standardCount: 4, bannerPity: {}, battleTeam: [],
  ambassadorSince: null as Date | null, titleId: null as string | null, frameId: "frame-hisui" as string | null, nameColorId: "color-lime" as string | null,
  leaderboardHiddenAt: null as Date | null, leaderboardMalus: 0, leaderboardMythicMalus: 0,
  incenseUsed: 0, incenseBonus: 0,
};

function setup({ role = "ADMIN", banned = false, exists = true, player = {} as Partial<typeof target>, pulled = 0, counter = { size: 25, taken: [] as number[] } } = {}) {
  const tx = {
    $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join("?");
      if (sql.includes('UPDATE "User" SET coins')) return [{ coins: target.coins + Number(values[0]) }];
      if (sql.includes('FROM "BoosterOpening"')) return [{ n: pulled }];
      // Compteur du tirage gravé, verrouillé (server/prestige/printing-core.ts)
      if (sql.includes('FROM "CardPrinting"')) return [counter];
      return [];
    }),
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => where.id === "admin" ? { ...target, id: "admin", role, bannedAt: banned ? new Date() : null } : exists ? { ...target, ...player } : null),
      findFirst: vi.fn().mockResolvedValue(null), update: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    coinTransaction: { createMany: vi.fn() },
    adminLog: { create: vi.fn() },
    session: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) },
    boosterType: { findUnique: vi.fn().mockResolvedValue({ id: "type" }) },
    boosterCredit: { findUnique: vi.fn().mockResolvedValue({ count: 5 }), upsert: vi.fn() },
    card: { findUnique: vi.fn().mockResolvedValue({ id: "card" }), count: vi.fn().mockResolvedValue(100) },
    userCard: {
      count: vi.fn().mockResolvedValue(3), createMany: vi.fn(), findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn(),
      findFirst: vi.fn().mockResolvedValue(null as { id: string; cardId: string; heritage: number; keptByOwner: number; printing: number | null } | null),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    userCardOwner: { createMany: vi.fn(), create: vi.fn(), count: vi.fn().mockResolvedValue(0) },
    discovery: { createMany: vi.fn(), count: vi.fn().mockResolvedValue(3) },
    // Retrouvailles du prestige (server/collection/discovery.ts)
    $executeRaw: vi.fn().mockResolvedValue(0),
    wishlistEntry: { findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn() },
    teamGift: { create: vi.fn().mockResolvedValue({ id: "gift" }) },
    notification: { create: vi.fn().mockResolvedValue({ id: "notif" }) },
    gameSetting: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn().mockResolvedValue({ value: 1000 }) },
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
    // Date du ban posée seulement s'il ne l'était pas déjà (banAccountWith, partagé avec les bans réseau)
    expect(tx.user.updateMany).toHaveBeenCalledWith({ where: { id: "player", bannedAt: null }, data: { bannedAt: expect.any(Date) } });
    expect(tx.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.not.objectContaining({ bannedAt: expect.anything() }) }));
  });
  it("lève un bannissement en effaçant sa date", async () => {
    const { tx, db } = setup();
    await mutateAdminUserWith(db, "admin", { ...base, kind: "account", username: "Player", role: "USER", banned: false, profileVisibility: "PRIVATE", showCollection: false });
    expect(tx.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ bannedAt: null }) }));
    expect(tx.user.updateMany).not.toHaveBeenCalled();
    expect(tx.session.deleteMany).not.toHaveBeenCalled();
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
  it("ajoute des Encens par le bonus, sans toucher aux gagnés, et notifie le joueur", async () => {
    // 2 500 cartes tirées, un Encens tous les 1 000 : 2 gagnés, 1 déjà activé → 1 disponible
    const { tx, db } = setup({ pulled: 2500, player: { incenseUsed: 1 } });
    const notified = vi.fn();
    await mutateAdminUserWith(db, "admin", { ...base, kind: "incense", mode: "ADD", amount: 3, message: "Merci !" }, notified);
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: "player" }, data: { incenseBonus: 3 } });
    expect(tx.teamGift.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: "player", kind: "INCENSE", cardId: null, boosterTypeId: null, quantity: 3, message: "Merci !" }),
    }));
    expect(tx.notification.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: "TEAM_GIFT", payload: { kind: "INCENSE", quantity: 3 } }),
    }));
    expect(notified).toHaveBeenCalledWith(["notif"]);
    const log = tx.adminLog.create.mock.calls[0][0].data;
    expect(log.action).toBe("USER_INCENSE");
    expect(log.before).toEqual({ available: 1, bonus: 0 });
    expect(log.after.values).toEqual({ available: 4, bonus: 3 });
  });
  it("retire ou fixe les Encens disponibles sans notifier, et refuse d'en retirer trop", async () => {
    const { tx, db } = setup({ pulled: 2500, player: { incenseUsed: 1, incenseBonus: 2 } });
    // 2 gagnés + 2 donnés − 1 activé = 3 disponibles ; les fixer à 0 retire aussi un gagné
    await mutateAdminUserWith(db, "admin", { ...base, kind: "incense", mode: "SET", amount: 0, message: "" });
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: "player" }, data: { incenseBonus: -1 } });
    await mutateAdminUserWith(db, "admin", { ...base, kind: "incense", mode: "REMOVE", amount: 2, message: "" });
    expect(tx.user.update).toHaveBeenLastCalledWith({ where: { id: "player" }, data: { incenseBonus: 0 } });
    expect(tx.teamGift.create).not.toHaveBeenCalled();
    expect(tx.notification.create).not.toHaveBeenCalled();
    await expect(mutateAdminUserWith(db, "admin", { ...base, kind: "incense", mode: "REMOVE", amount: 4, message: "" })).rejects.toMatchObject({ code: "INSUFFICIENT" });
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
    expect(tx.userCard.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ ownerId: "player", status: "COLLECTION", showcaseItems: { none: {} }, auctions: { none: {} } }) }));
    expect(tx.userCard.deleteMany).not.toHaveBeenCalled();
  });
  it("définit les crédits d'un type existant, même inactif", async () => {
    const { tx, db } = setup();
    await mutateAdminUserWith(db, "admin", { ...base, kind: "booster", boosterTypeId: "type", mode: "ADD", amount: 7, message: null });
    expect(tx.boosterCredit.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { count: 12 } }));
    tx.boosterType.findUnique.mockResolvedValueOnce(null);
    await expect(mutateAdminUserWith(db, "admin", { ...base, kind: "booster", boosterTypeId: "missing", mode: "SET", amount: 1, message: null })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("donne des exemplaires ordinaires sans provenance quand le prestige vaut 0", async () => {
    const { tx, db } = setup();
    await mutateAdminUserWith(db, "admin", { ...base, kind: "card", cardId: "card", mode: "ADD", amount: 2, heritage: 0, message: null });
    expect(tx.userCard.createMany.mock.calls[0][0].data.every((c: { heritage: number }) => c.heritage === 0)).toBe(true);
    expect(tx.userCardOwner.createMany).not.toHaveBeenCalled();
    // Pas de prestige demandé : le plafond n'est même pas lu
    expect(tx.gameSetting.findUnique).not.toHaveBeenCalledWith(expect.objectContaining({ where: { key: "prestige.heritageMax" } }));
  });
  it("donne des exemplaires héritiers qui ouvrent leur provenance chez le joueur", async () => {
    const { tx, db } = setup();
    await mutateAdminUserWith(db, "admin", { ...base, kind: "card", cardId: "card", mode: "ADD", amount: 2, heritage: 3, message: null });
    const created = tx.userCard.createMany.mock.calls[0][0].data as { id: string; heritage: number; ownerId: string }[];
    expect(created).toHaveLength(2);
    expect(created.every((c) => c.heritage === 3 && c.ownerId === "player" && typeof c.id === "string")).toBe(true);
    expect(tx.userCardOwner.createMany).toHaveBeenCalledWith({ data: created.map((c) => expect.objectContaining({ userCardId: c.id, ownerId: "player", via: "GIFT" })) });
    expect(tx.adminLog.create.mock.calls[0][0].data.after.values).toEqual({ cardId: "card", copies: 5, heritage: 3 });
  });
  it("refuse un prestige au-dessus du plafond réglé", async () => {
    const { tx, db } = setup();
    tx.gameSetting.findUnique.mockResolvedValue({ value: 2 });
    await expect(mutateAdminUserWith(db, "admin", { ...base, kind: "card", cardId: "card", mode: "ADD", amount: 1, heritage: 3, message: null })).rejects.toMatchObject({ code: "LIMIT" });
    expect(tx.userCard.createMany).not.toHaveBeenCalled();
    expect(tx.teamGift.create).not.toHaveBeenCalled();
  });
  it("change le prestige d'un exemplaire du joueur et ouvre sa provenance s'il était ordinaire", async () => {
    const { tx, db } = setup();
    tx.userCard.findFirst.mockResolvedValue({ id: "copy", cardId: "card", heritage: 0, keptByOwner: 0, printing: null });
    await mutateAdminUserWith(db, "admin", { ...base, kind: "copyHeritage", userCardId: "copy", heritage: 4 });
    expect(tx.userCard.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "copy", ownerId: "player" } }));
    expect(tx.userCard.updateMany).toHaveBeenCalledWith({ where: { id: "copy", ownerId: "player" }, data: { heritage: 4, keptByOwner: 0 } });
    expect(tx.userCardOwner.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userCardId: "copy", ownerId: "player", via: "GIFT" }) });
    const log = tx.adminLog.create.mock.calls[0][0].data;
    expect(log.action).toBe("USER_COPYHERITAGE");
    expect(log.before).toEqual({ userCardId: "copy", cardId: "card", heritage: 0, keptByOwner: 0 });
    expect(log.after.values).toEqual({ userCardId: "copy", cardId: "card", heritage: 4, keptByOwner: 0 });
  });
  it("garde le compteur d'une héritière, le remet à zéro au prestige 0, sans réécrire de provenance", async () => {
    const { tx, db } = setup();
    tx.userCard.findFirst.mockResolvedValue({ id: "heir", cardId: "card", heritage: 2, keptByOwner: 2, printing: null });
    await mutateAdminUserWith(db, "admin", { ...base, kind: "copyHeritage", userCardId: "heir", heritage: 5 });
    expect(tx.userCard.updateMany).toHaveBeenLastCalledWith({ where: { id: "heir", ownerId: "player" }, data: { heritage: 5, keptByOwner: 2 } });
    await mutateAdminUserWith(db, "admin", { ...base, kind: "copyHeritage", userCardId: "heir", heritage: 0 });
    expect(tx.userCard.updateMany).toHaveBeenLastCalledWith({ where: { id: "heir", ownerId: "player" }, data: { heritage: 0, keptByOwner: 0 } });
    expect(tx.userCardOwner.create).not.toHaveBeenCalled();
  });
  it("refuse l'exemplaire d'un autre joueur et un prestige au-dessus du plafond", async () => {
    const { tx, db } = setup();
    await expect(mutateAdminUserWith(db, "admin", { ...base, kind: "copyHeritage", userCardId: "elsewhere", heritage: 1 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    tx.userCard.findFirst.mockResolvedValue({ id: "copy", cardId: "card", heritage: 0, keptByOwner: 0, printing: 1 });
    tx.gameSetting.findUnique.mockResolvedValue({ value: 3 });
    await expect(mutateAdminUserWith(db, "admin", { ...base, kind: "copyHeritage", userCardId: "copy", heritage: 4 })).rejects.toMatchObject({ code: "LIMIT" });
    expect(tx.userCard.updateMany).not.toHaveBeenCalled();
    expect(tx.adminLog.create).not.toHaveBeenCalled();
  });
  it("donne un exemplaire gravé au numéro choisi, pris dans le compteur du tirage", async () => {
    const { tx, db } = setup({ counter: { size: 25, taken: [1, 2] } });
    await mutateAdminUserWith(db, "admin", { ...base, kind: "card", cardId: "card", mode: "ADD", amount: 1, heritage: 0, engraving: { printing: 2, serial: 7 }, message: null });
    expect(tx.userCard.createMany.mock.calls[0][0].data[0]).toMatchObject({ ownerId: "player", heritage: 0, printing: 2, serial: 7 });
    const issued = tx.$executeRaw.mock.calls.find((c) => (c[0] as TemplateStringsArray).join("?").includes("array_append"));
    expect(issued?.slice(1)).toEqual([7, "card", 2]);
    expect(tx.userCardOwner.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ ownerId: "player", via: "GIFT" })] });
    expect(tx.adminLog.create.mock.calls[0][0].data.after.values).toMatchObject({ editions: [{ printing: 2, serial: 7 }] });
  });
  it("tire au hasard un numéro libre pour chaque exemplaire gravé", async () => {
    const { tx, db } = setup({ counter: { size: 5, taken: [1, 2, 3] } });
    await mutateAdminUserWith(db, "admin", { ...base, kind: "card", cardId: "card", mode: "ADD", amount: 2, engraving: { printing: 1, serial: null }, message: null });
    const serials = (tx.userCard.createMany.mock.calls[0][0].data as { serial: number }[]).map((c) => c.serial);
    expect(serials.every((s) => s === 4 || s === 5)).toBe(true);
  });
  it("refuse un numéro déjà sorti ou hors du tirage, sans rien donner", async () => {
    for (const serial of [2, 26]) {
      const { tx, db } = setup({ counter: { size: 25, taken: [1, 2] } });
      await expect(mutateAdminUserWith(db, "admin", { ...base, kind: "card", cardId: "card", mode: "ADD", amount: 1, engraving: { printing: 1, serial }, message: null }))
        .rejects.toMatchObject({ code: "SERIAL_UNAVAILABLE" });
      expect(tx.userCard.createMany).not.toHaveBeenCalled();
      expect(tx.teamGift.create).not.toHaveBeenCalled();
    }
  });
  it("n'accepte un numéro choisi que pour un seul exemplaire donné", () => {
    const input = { ...base, kind: "card", cardId: "card", mode: "ADD", amount: 2, heritage: 0, engraving: { printing: 1, serial: 3 }, message: "" };
    expect(adminUserMutationSchema.safeParse(input).success).toBe(false);
    expect(adminUserMutationSchema.safeParse({ ...input, amount: 1 }).success).toBe(true);
    expect(adminUserMutationSchema.safeParse({ ...input, engraving: { printing: 1, serial: null } }).success).toBe(true);
  });
  it("grave un exemplaire ordinaire du joueur et ouvre sa provenance", async () => {
    const { tx, db } = setup();
    tx.userCard.findFirst.mockResolvedValue({ id: "copy", cardId: "card", heritage: 0, printing: null, serial: null, card: { rarity: "MYTHIC" } } as never);
    await mutateAdminUserWith(db, "admin", { ...base, kind: "copyEngraving", userCardId: "copy", engraving: { printing: 1, serial: 3 } });
    expect(tx.userCard.updateMany).toHaveBeenCalledWith({ where: { id: "copy", ownerId: "player" }, data: { printing: 1, serial: 3 } });
    expect(tx.userCardOwner.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userCardId: "copy", ownerId: "player", via: "GIFT" }) });
    const log = tx.adminLog.create.mock.calls[0][0].data;
    expect(log.action).toBe("USER_COPYENGRAVING");
    expect(log.before).toEqual({ userCardId: "copy", cardId: "card", engraving: null });
    expect(log.after.values).toEqual({ userCardId: "copy", cardId: "card", engraving: { printing: 1, serial: 3 } });
  });
  it("change ou retire la gravure d'un exemplaire, sans rien écrire si elle ne change pas", async () => {
    const { tx, db } = setup();
    tx.userCard.findFirst.mockResolvedValue({ id: "g", cardId: "card", heritage: 2, printing: 1, serial: 4, card: { rarity: "MYTHIC" } } as never);
    // Même tirage, même numéro : ni compteur, ni écriture
    await mutateAdminUserWith(db, "admin", { ...base, kind: "copyEngraving", userCardId: "g", engraving: { printing: 1, serial: 4 } });
    expect(tx.userCard.updateMany).not.toHaveBeenCalled();
    expect(tx.$executeRaw.mock.calls.some((c) => (c[0] as TemplateStringsArray).join("?").includes("CardPrinting"))).toBe(false);
    // Nouveau numéro : l'ancien reste sorti
    await mutateAdminUserWith(db, "admin", { ...base, kind: "copyEngraving", userCardId: "g", engraving: { printing: 1, serial: 9 } });
    expect(tx.userCard.updateMany).toHaveBeenLastCalledWith({ where: { id: "g", ownerId: "player" }, data: { printing: 1, serial: 9 } });
    // Retrait : l'exemplaire reste héritier, sans nouvelle provenance
    await mutateAdminUserWith(db, "admin", { ...base, kind: "copyEngraving", userCardId: "g", engraving: null });
    expect(tx.userCard.updateMany).toHaveBeenLastCalledWith({ where: { id: "g", ownerId: "player" }, data: { printing: null, serial: null } });
    expect(tx.userCardOwner.create).not.toHaveBeenCalled();
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

  it("pose un malus de cartes et de Mythiques sans toucher à la collection, et le journalise", async () => {
    const { tx, db } = setup();
    await mutateAdminUserWith(db, "admin", { ...base, kind: "leaderboardMalus", value: 750, mythics: 12 });
    expect(tx.user.update.mock.calls[0][0].data).toEqual({ leaderboardMalus: 750, leaderboardMythicMalus: 12 });
    const log = tx.adminLog.create.mock.calls[0][0].data;
    expect(log.action).toBe("USER_LEADERBOARDMALUS");
    expect(log.before).toEqual({ malus: 0, mythicMalus: 0 });
    expect(log.after.values).toEqual({ malus: 750, mythicMalus: 12 });
  });
});
