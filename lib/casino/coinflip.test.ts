import { describe, expect, it } from "vitest";
import {
  canCancel,
  canDecline,
  checkCreate,
  checkJoin,
  checkPlayer,
  checkStake,
  coinFlipExpiresAt,
  flipWinner,
  isTableExpired,
  isTableOpen,
  type CreateCheck,
  type JoinCheck,
  type TableState,
} from "./coinflip";
import { DEFAULT_CASINO_RULES, type CasinoRules } from "./rules";

const HOUR = 3_600_000;
const NOW = new Date("2026-12-05T12:00:00.000Z");
const OPENS = Date.parse("2026-12-01T19:00:00.000Z");
const RULES: CasinoRules = { ...DEFAULT_CASINO_RULES, opensAt: OPENS };
const FLIP = RULES.coinflip;

const player = { isGuest: false, bannedAt: null, createdAt: new Date(NOW.getTime() - 30 * 24 * HOUR), isAdmin: false };

describe("joueur", () => {
  it("un compte établi joue une fois le casino ouvert", () => {
    expect(checkPlayer(player, NOW, RULES)).toBeNull();
  });

  it("avant l'ouverture, seuls les admins jouent (aperçu)", () => {
    const early = new Date(OPENS - 1);
    expect(checkPlayer(player, early, RULES)).toBe("CLOSED");
    expect(checkPlayer({ ...player, isAdmin: true }, early, RULES)).toBeNull();
    expect(checkPlayer(player, NOW, { ...RULES, opensAt: null })).toBe("CLOSED");
  });

  it("jeu coupé, invité, banni, compte de moins de 48 h", () => {
    expect(checkPlayer(player, NOW, { ...RULES, coinflip: { ...FLIP, enabled: false } })).toBe("DISABLED");
    expect(checkPlayer({ ...player, isGuest: true }, NOW, RULES)).toBe("GUEST");
    expect(checkPlayer({ ...player, bannedAt: NOW }, NOW, RULES)).toBe("BANNED");
    expect(checkPlayer({ ...player, createdAt: new Date(NOW.getTime() - 47 * HOUR) }, NOW, RULES)).toBe("TOO_NEW");
    expect(checkPlayer({ ...player, createdAt: new Date(NOW.getTime() - 48 * HOUR) }, NOW, RULES)).toBeNull();
  });
});

describe("mise", () => {
  it("une carte en plusieurs exemplaires se mise sans confirmation", () => {
    expect(checkStake({ rarity: "RARE", copies: 2, confirmLastCopy: false }, FLIP)).toBeNull();
  });

  it("le dernier exemplaire demande une confirmation", () => {
    expect(checkStake({ rarity: "RARE", copies: 1, confirmLastCopy: false }, FLIP)).toBe("CONFIRM_LAST_COPY");
    expect(checkStake({ rarity: "RARE", copies: 1, confirmLastCopy: true }, FLIP)).toBeNull();
  });

  it("le réglage peut interdire le dernier exemplaire", () => {
    expect(checkStake({ rarity: "RARE", copies: 1, confirmLastCopy: true }, { ...FLIP, lastCopyAllowed: false })).toBe("LAST_COPY");
  });

  it("une rareté retirée du jeu est refusée", () => {
    expect(checkStake({ rarity: "XR", copies: 3, confirmLastCopy: false }, { ...FLIP, allowedRarities: ["COMMON"] })).toBe("RARITY");
  });
});

describe("poser une table", () => {
  const base: CreateCheck = { stake: { rarity: "EPIC", copies: 2, confirmLastCopy: false }, openTables: 0, flipsToday: 0, reserve: null };

  it("passe sous les plafonds", () => {
    expect(checkCreate(base, FLIP)).toBeNull();
    expect(checkCreate({ ...base, openTables: 2, flipsToday: 19 }, FLIP)).toBeNull();
  });

  it("3 tables ouvertes au plus, 20 lancers par jour", () => {
    expect(checkCreate({ ...base, openTables: 3 }, FLIP)).toBe("TABLE_LIMIT");
    expect(checkCreate({ ...base, flipsToday: 20 }, FLIP)).toBe("DAILY_LIMIT");
  });

  it("réservation : ami ou ancien adversaire, ni soi-même ni un joueur bloqué", () => {
    const ok = { self: false, eligible: true, blocked: false };
    expect(checkCreate({ ...base, reserve: ok }, FLIP)).toBeNull();
    expect(checkCreate({ ...base, reserve: { ...ok, self: true } }, FLIP)).toBe("RESERVE_TARGET");
    expect(checkCreate({ ...base, reserve: { ...ok, eligible: false } }, FLIP)).toBe("RESERVE_TARGET");
    expect(checkCreate({ ...base, reserve: { ...ok, blocked: true } }, FLIP)).toBe("BLOCKED");
  });
});

describe("relever une table", () => {
  const table: TableState = { status: "OPEN", expiresAt: new Date(NOW.getTime() + HOUR), creatorId: "a", reservedForId: null, tierOrder: 500 };
  const base: JoinCheck = { table, joinerId: "b", stakeTier: 500, stake: { rarity: "BR", copies: 2, confirmLastCopy: false }, blocked: false, flipsToday: 0, now: NOW };

  it("une fuda du même palier relève la table", () => {
    expect(checkJoin(base, FLIP)).toBeNull();
  });

  it("refuse une table jouée, retirée ou expirée", () => {
    expect(checkJoin({ ...base, table: { ...table, status: "DONE" } }, FLIP)).toBe("NOT_OPEN");
    expect(checkJoin({ ...base, table: { ...table, status: "CANCELLED" } }, FLIP)).toBe("NOT_OPEN");
    expect(checkJoin({ ...base, table: { ...table, expiresAt: NOW } }, FLIP)).toBe("NOT_OPEN");
  });

  it("pas contre soi-même, pas une table réservée à un autre, pas un joueur bloqué", () => {
    expect(checkJoin({ ...base, joinerId: "a" }, FLIP)).toBe("OWN_TABLE");
    expect(checkJoin({ ...base, table: { ...table, reservedForId: "c" } }, FLIP)).toBe("RESERVED");
    expect(checkJoin({ ...base, table: { ...table, reservedForId: "b" } }, FLIP)).toBeNull();
    expect(checkJoin({ ...base, blocked: true }, FLIP)).toBe("BLOCKED");
  });

  it("refuse un autre palier ou une rareté inconnue", () => {
    expect(checkJoin({ ...base, stakeTier: 600 }, FLIP)).toBe("TIER");
    expect(checkJoin({ ...base, stakeTier: null }, FLIP)).toBe("TIER");
  });

  it("dernier exemplaire et quota du jour", () => {
    expect(checkJoin({ ...base, stake: { ...base.stake, copies: 1 } }, FLIP)).toBe("CONFIRM_LAST_COPY");
    expect(checkJoin({ ...base, flipsToday: 20 }, FLIP)).toBe("DAILY_LIMIT");
  });
});

describe("cycle de vie", () => {
  const table = { status: "OPEN" as const, expiresAt: coinFlipExpiresAt(NOW, 24), creatorId: "a", reservedForId: "b" };

  it("expire 24 h après sa pose", () => {
    expect(table.expiresAt.getTime() - NOW.getTime()).toBe(24 * HOUR);
    expect(isTableOpen(table, NOW)).toBe(true);
    expect(isTableOpen(table, table.expiresAt)).toBe(false);
    expect(isTableExpired(table, table.expiresAt)).toBe(true);
    expect(isTableExpired({ ...table, status: "DONE" }, table.expiresAt)).toBe(false);
  });

  it("le créateur retire sa table ouverte, même expirée", () => {
    expect(canCancel(table, "a")).toBe(true);
    expect(canCancel(table, "b")).toBe(false);
    expect(canCancel({ ...table, status: "DONE" }, "a")).toBe(false);
  });

  it("seul le joueur invité décline, tant que la table est ouverte", () => {
    expect(canDecline(table, "b", NOW)).toBe(true);
    expect(canDecline(table, "c", NOW)).toBe(false);
    expect(canDecline(table, "b", table.expiresAt)).toBe(false);
  });

  it("le créateur gagne si la pièce tombe sur sa face", () => {
    expect(flipWinner({ creatorId: "a", creatorSide: "OMOTE" }, "b", "OMOTE")).toBe("a");
    expect(flipWinner({ creatorId: "a", creatorSide: "OMOTE" }, "b", "URA")).toBe("b");
    expect(flipWinner({ creatorId: "a", creatorSide: "URA" }, "b", "URA")).toBe("a");
  });
});
