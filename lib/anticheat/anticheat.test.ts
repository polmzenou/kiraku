import { describe, expect, it } from "vitest";
import { emailStem, normalizeEmail, textStem } from "./email";
import { SETTING_DEFAULTS } from "@/lib/settings/defaults";
import { maskEmail, maskIp } from "./mask";
import { detectClusters, reasonWeight, scorePairs, type DetectionInput } from "./score";
import { DETECTION_SCORING_DEFAULT, detectionScoringSchema } from "./scoring";
import { isDeviceId, isRecordableIp } from "./signals";

const t0 = new Date("2026-11-01T10:00:00Z");
const at = (minutes: number) => new Date(t0.getTime() + minutes * 60_000);

function input(over: Partial<DetectionInput> = {}): DetectionInput {
  return { users: [], signals: [], referrals: [], onlyFriends: [], transfers: [], sharedCap: 8, minScore: 40, ...over };
}

describe("e-mails et pseudos", () => {
  it("ramène les alias à la même boîte", () => {
    expect(normalizeEmail("Paul.Mehr+kiraku@GoogleMail.com")).toBe("paulmehr@gmail.com");
    expect(normalizeEmail("paul.mehr@outlook.fr")).toBe("paul.mehr@outlook.fr");
    expect(normalizeEmail("pas-un-email")).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
  });

  it("donne la même racine aux variantes numérotées", () => {
    expect(emailStem("paul.mehr68@gmail.com")).toBe("paulmehr");
    expect(emailStem("paulmehr2@outlook.fr")).toBe("paulmehr");
    expect(emailStem("jo1@gmail.com")).toBeNull(); // trop court
    expect(textStem("Kaïto_99")).toBe("kaito");
  });
});

describe("masquage pour le DEV", () => {
  it("cache la fin des IP et la boîte e-mail", () => {
    expect(maskIp("86.245.12.3")).toBe("86.245.x.x");
    expect(maskIp("2a01:cb00:1:2::5")).toBe("2a01:cb00:…");
    expect(maskEmail("paul.mehr68@gmail.com")).toBe("pa***@gmail.com");
    expect(maskEmail("a@b.fr")).toBe("a***@b.fr");
  });
});

describe("valeurs relevées", () => {
  it("n'accepte que des IP et des identifiants d'appareil plausibles", () => {
    expect(isRecordableIp("203.0.113.7")).toBe(true);
    expect(isRecordableIp("2a01:cb00::5")).toBe(true);
    expect(isRecordableIp("local")).toBe(false);
    expect(isRecordableIp("1.2.3.4; DROP")).toBe(false);
    expect(isDeviceId("0123456789abcdef0123456789abcdef")).toBe(true);
    expect(isDeviceId("../../etc")).toBe(false);
    expect(isDeviceId(undefined)).toBe(false);
  });
});

describe("détection des multi-comptes", () => {
  // Le cas qui a motivé la page : un compte principal et deux comptes secondaires aux e-mails proches,
  // dont le seul ami est le principal et qui lui envoient leurs cartes
  const main = { id: "main", username: "Paul", email: "paul.mehr@gmail.com", createdAt: at(0) };
  const alt1 = { id: "alt1", username: "Zorro", email: "paulmehr2@gmail.com", createdAt: at(60 * 24) };
  const alt2 = { id: "alt2", username: "Zebulon", email: "paul.mehr3@hotmail.fr", createdAt: at(60 * 24 + 5) };
  const other = { id: "other", username: "Kaito", email: "kaito@gmail.com", createdAt: at(3) };

  it("regroupe le compte principal et ses deux comptes secondaires", () => {
    const clusters = detectClusters(
      input({
        users: [main, alt1, alt2, other],
        onlyFriends: [{ userId: "alt1", friendId: "main" }, { userId: "alt2", friendId: "main" }],
        transfers: [
          { fromId: "alt1", toId: "main", kind: "gift", count: 4 },
          { fromId: "alt2", toId: "main", kind: "sale", count: 3 },
        ],
      }),
    );
    expect(clusters).toHaveLength(1);
    expect(clusters[0].userIds).toEqual(["alt1", "alt2", "main"]);
    const pair = clusters[0].pairs.find((p) => p.a === "alt1" && p.b === "main")!;
    expect(pair.reasons.map((r) => r.kind)).toEqual(["emailStem", "flow", "onlyFriend"]);
    expect(pair.score).toBe(60);
    expect(pair.reasons.find((r) => r.kind === "flow")).toMatchObject({ fromId: "alt1", toId: "main", gifts: 4 });
  });

  it("relie deux comptes du même appareil, et compte la création rapprochée avec une IP commune", () => {
    const pairs = scorePairs(
      input({
        users: [main, other],
        signals: [
          { userId: "main", kind: "DEVICE", value: "d1" },
          { userId: "other", kind: "DEVICE", value: "d1" },
          { userId: "main", kind: "IP", value: "1.2.3.4" },
          { userId: "other", kind: "IP", value: "1.2.3.4" },
        ],
      }),
    );
    expect(pairs).toHaveLength(1);
    expect(pairs[0].reasons.map((r) => r.kind)).toEqual(["device", "ip", "createdClose"]);
    expect(pairs[0].score).toBe(60 + 30 + 20);
  });

  it("ignore une IP partagée par trop de comptes (4G, école)", () => {
    const users = Array.from({ length: 5 }, (_, i) => ({ id: `u${i}`, username: `joueur${i}x`, email: null, createdAt: at(i * 1000) }));
    const signals = users.map((u) => ({ userId: u.id, kind: "IP" as const, value: "9.9.9.9" }));
    expect(scorePairs(input({ users, signals, sharedCap: 4 }))).toEqual([]);
    expect(scorePairs(input({ users, signals, sharedCap: 5 }))).toHaveLength(10);
  });

  it("relie une ferme de comptes sur un même appareil, même au-delà du plafond des IP communes", () => {
    const users = Array.from({ length: 10 }, (_, i) => ({ id: `f${i}`, username: `ferme${i}x`, email: null, createdAt: at(i * 1000) }));
    const signals = users.map((u) => ({ userId: u.id, kind: "DEVICE" as const, value: "appareil-commun" }));
    const pairs = scorePairs(input({ users, signals, sharedCap: 8 }));
    expect(pairs).toHaveLength(45);
    expect(pairs.every((p) => p.reasons.some((r) => r.kind === "device"))).toBe(true);
  });

  it("relie deux adresses IPv6 du même foyer (même /64)", () => {
    const pairs = scorePairs(
      input({
        users: [main, other],
        signals: [
          { userId: "main", kind: "IP", value: "2a01:cb00:1234:5600:1111:2222:3333:4444" },
          { userId: "other", kind: "IP", value: "2a01:cb00:1234:5600:aaaa:bbbb:cccc:dddd" },
        ],
      }),
    );
    expect(pairs).toHaveLength(1);
    expect(pairs[0].reasons.map((r) => r.kind)).toContain("ip");
  });

  it("n'utilise pas les comptes absents de la liste (invités, anonymisés)", () => {
    const pairs = scorePairs(
      input({
        users: [main],
        signals: [{ userId: "main", kind: "DEVICE", value: "d1" }, { userId: "guest", kind: "DEVICE", value: "d1" }],
        referrals: [{ referrerId: "main", refereeId: "guest" }],
      }),
    );
    expect(pairs).toEqual([]);
  });

  it("garde sous le seuil les paires faibles, sans former de groupe", () => {
    const data = input({ users: [main, other], referrals: [{ referrerId: "main", refereeId: "other" }] });
    expect(scorePairs(data)[0].score).toBe(15 + 10); // parrainage + créés à 3 min
    expect(detectClusters(data)).toEqual([]);
  });

  it("barème réglable : poids et seuils lus dans multiAccount.scoring, barème d'origine par défaut", () => {
    // Valeurs d'origine (avant le réglage) : un changement de défaut changerait les mises « À vérifier » du parrainage
    expect(SETTING_DEFAULTS["multiAccount.scoring"]).toEqual(DETECTION_SCORING_DEFAULT);
    expect(DETECTION_SCORING_DEFAULT).toEqual({
      device: 60, emailAlias: 50, ip: 30, emailStem: 30, flow: 20, referral: 15, createdClose: 10, usernameStem: 10, onlyFriend: 10, interactions: 10,
      createdCloseMinutes: 15, flowMin: 3, flowSharePct: 80, interactionsMin: 5,
    });
    expect(detectionScoringSchema.safeParse(DETECTION_SCORING_DEFAULT).success).toBe(true);

    const signals = [
      { userId: "main", kind: "DEVICE" as const, value: "d1" },
      { userId: "other", kind: "DEVICE" as const, value: "d1" },
      { userId: "main", kind: "IP" as const, value: "1.2.3.4" },
      { userId: "other", kind: "IP" as const, value: "1.2.3.4" },
    ];
    const scoring = { ...DETECTION_SCORING_DEFAULT, device: 100, ip: 5, createdClose: 7, createdCloseMinutes: 2 };
    // Créés à 3 min d'écart : hors de la fenêtre de 2 min
    const [pair] = scorePairs(input({ users: [main, other], signals, scoring }));
    expect(pair.reasons.map((r) => r.kind)).toEqual(["device", "ip"]);
    expect(pair.score).toBe(105);
    expect(reasonWeight({ kind: "createdClose", minutes: 1, withIp: true }, scoring)).toBe(14);
    expect(reasonWeight({ kind: "createdClose", minutes: 1, withIp: true })).toBe(20);
  });

  it("seuils du flux : nombre de transferts et part du sens dominant", () => {
    const transfers = [
      { fromId: "main", toId: "other", kind: "gift" as const, count: 3 },
      { fromId: "other", toId: "main", kind: "gift" as const, count: 1 },
    ];
    const kinds = (over: Partial<DetectionInput>) => scorePairs(input({ users: [main, other], transfers, ...over }))[0]?.reasons.map((r) => r.kind) ?? [];
    // 3 sur 4 dans le même sens = 75 % : sous les 80 % d'origine, au-dessus d'un seuil de 70 %
    expect(kinds({})).not.toContain("flow");
    expect(kinds({ scoring: { ...DETECTION_SCORING_DEFAULT, flowSharePct: 70 } })).toContain("flow");
    expect(kinds({ scoring: { ...DETECTION_SCORING_DEFAULT, flowSharePct: 70, flowMin: 5 } })).not.toContain("flow");
  });

  it("distingue des échanges fréquents sans sens dominant d'un flux à sens unique", () => {
    const pairs = scorePairs(
      input({
        users: [main, other],
        transfers: [
          { fromId: "main", toId: "other", kind: "gift", count: 2 },
          { fromId: "other", toId: "main", kind: "gift", count: 2 },
          { fromId: "main", toId: "other", kind: "swap", count: 2 },
        ],
      }),
    );
    expect(pairs[0].reasons.map((r) => r.kind)).toEqual(["interactions", "createdClose"]);
  });
});
