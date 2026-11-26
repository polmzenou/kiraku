import { describe, expect, it } from "vitest";
import { isNetworkGateFree } from "@/lib/legal/legal";
import { SEAL_GLYPHS } from "@/lib/seal-glyphs";
import { SETTING_DEFAULTS } from "@/lib/settings/defaults";
import {
  adminBanExpiry,
  banState,
  followDecision,
  ipBanKey,
  ipKeyPatterns,
  isBannableIp,
  isIpv4Key,
  NETWORK_BAN_KANJI,
  selectionOf,
  signalBanKey,
  type KeyFacts,
} from "./network";

describe("clé de ban d'une IP", () => {
  it("garde une IPv4 telle quelle, sans zéros de tête", () => {
    expect(ipBanKey("86.245.12.3")).toBe("86.245.12.3");
    expect(ipBanKey("86.245.012.003")).toBe("86.245.12.3");
  });

  it("ramène une IPv4 encapsulée (serveur en double pile) à l'IPv4", () => {
    expect(ipBanKey("::ffff:86.245.12.3")).toBe("86.245.12.3");
    expect(ipBanKey("::FFFF:56f5:c03")).toBe("86.245.12.3");
  });

  it("donne le même préfixe /64 pour toutes les écritures et adresses d'un même réseau IPv6", () => {
    const key = "2a01:cb00:1:2::/64";
    for (const ip of [
      "2a01:cb00:1:2::5",
      "2a01:cb00:0001:0002:0000:0000:0000:0005",
      "2A01:CB00:1:2:AB:CD:EF:1",
      "2a01:cb00:1:2:1234:5678:9abc:def0",
      "2a01:cb00:1:2::5%eth0",
    ]) {
      expect(ipBanKey(ip), ip).toBe(key);
    }
    expect(ipBanKey("2a01:cb00:1:3::5")).not.toBe(key);
  });

  it("n'écrit jamais les groupes nuls compressés dans la clé", () => {
    expect(ipBanKey("2a01:cb00::1")).toBe("2a01:cb00:0:0::/64");
    expect(ipBanKey("2a01::1:2:3:4")).toBe("2a01:0:0:0::/64");
  });

  it("refuse ce qui n'est pas une IP", () => {
    for (const bad of ["local", "", "1.2.3", "1.2.3.256", "1.2.3.4.5", "::1::", "2a01:cb00:1:2:3:4:5:6:7", "2a01:cb00::1.2.3.4::", "g::1", ":1", "1:", "1.2.3.4:5"]) {
      expect(ipBanKey(bad), bad).toBeNull();
    }
  });
});

describe("IP bannissables", () => {
  it("accepte les adresses publiques", () => {
    expect(isBannableIp("86.245.12.3")).toBe(true);
    expect(isBannableIp("2a01:cb00:1:2::5")).toBe(true);
    expect(isBannableIp("2a01:cb00:1:2::/64")).toBe(true);
  });

  it("refuse les adresses privées, locales, partagées d'opérateur et réservées", () => {
    for (const ip of ["10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.10", "127.0.0.1", "169.254.1.1", "100.64.0.1", "100.127.255.255", "0.1.2.3", "192.0.2.5", "224.0.0.1", "255.255.255.255", "::1", "::", "fe80::1", "fd00::1", "ff02::1", "2001:db8::1", "::ffff:192.168.1.1", "local"]) {
      expect(isBannableIp(ip), ip).toBe(false);
    }
    // Aux bords des plages
    expect(isBannableIp("172.32.0.1")).toBe(true);
    expect(isBannableIp("100.128.0.1")).toBe(true);
  });
});

describe("clé d'un relevé", () => {
  it("prend l'appareil tel quel s'il a la bonne forme", () => {
    expect(signalBanKey("DEVICE", "a".repeat(32))).toBe("a".repeat(32));
    expect(signalBanKey("DEVICE", "pas-un-appareil")).toBeNull();
    expect(signalBanKey("IP", "2a01:cb00:1:2::5")).toBe("2a01:cb00:1:2::/64");
  });

  it("préfiltre les relevés qui peuvent tomber sous une clé", () => {
    expect(ipKeyPatterns("86.245.12.3")).toEqual(["86.245.12.3", "::ffff:86.245.12.3"]);
    expect(ipKeyPatterns("2a01:cb00:1:2::/64")).toEqual(["2a01:cb00:%"]);
    // Second groupe nul : il peut être compressé dans le relevé (« 2a01::… »)
    expect(ipKeyPatterns("2a01:0:0:0::/64")).toEqual(["2a01:0:%", "2a01::%"]);
  });
});

describe("état d'une clé au moment de bannir", () => {
  const ip = (facts: Partial<KeyFacts>): KeyFacts => ({ kind: "IP", key: "86.245.12.3", banned: false, staffSeen: false, accounts: 1, othersActive: 0, ...facts });

  it("refuse dans l'ordre : déjà bannie, privée, équipe, trop partagée", () => {
    expect(banState(ip({ banned: true, staffSeen: true }), 8)).toBe("BANNED");
    expect(banState(ip({ key: "192.168.1.1", staffSeen: true }), 8)).toBe("PRIVATE");
    expect(banState(ip({ staffSeen: true, accounts: 20 }), 8)).toBe("STAFF");
    expect(banState(ip({ accounts: 12, othersActive: 9 }), 8)).toBe("CAP");
    expect(banState(ip({ accounts: 8, othersActive: 2 }), 8)).toBe("SHARED");
    expect(banState(ip({ accounts: 3 }), 8)).toBe("OK");
  });

  it("une ferme de comptes reste bannissable : seuls les comptes actifs hors du groupe visé comptent pour le plafond", () => {
    expect(banState(ip({ accounts: 10, othersActive: 0 }), 8)).toBe("OK");
    expect(banState(ip({ accounts: 14, othersActive: 4 }), 8)).toBe("SHARED");
  });

  it("n'applique ni la plage ni la limite de partage à un appareil", () => {
    expect(banState({ kind: "DEVICE", key: "a".repeat(32), banned: false, staffSeen: false, accounts: 30, othersActive: 0 }, 8)).toBe("OK");
  });

  it("précoche seulement ce qui ne coupe personne d'autre", () => {
    expect(selectionOf("OK")).toEqual({ selectable: true, checked: true });
    expect(selectionOf("SHARED")).toEqual({ selectable: true, checked: false });
    for (const state of ["BANNED", "STAFF", "PRIVATE", "CAP"] as const) expect(selectionOf(state)).toEqual({ selectable: false, checked: false });
  });
});

describe("le ban suit l'appareil", () => {
  const base = { enabled: true, ipv4: true, ipKey: "86.245.12.3", exempt: false, staffSeen: false, othersActive: 0, maxOthers: 0, autoBans: 0, perDevice: 5 };

  it("bannit une nouvelle IP propre", () => {
    expect(followDecision(base)).toBe("FOLLOW");
    expect(followDecision({ ...base, othersActive: 1, maxOthers: 1 })).toBe("FOLLOW");
  });

  it("ne bannit pas quand c'est coupé, privé, à l'équipe, plein ou partagé", () => {
    expect(followDecision({ ...base, enabled: false })).toBe("OFF");
    expect(followDecision({ ...base, ipKey: null })).toBe("NOT_BANNABLE");
    expect(followDecision({ ...base, ipKey: "10.0.0.1" })).toBe("NOT_BANNABLE");
    expect(followDecision({ ...base, staffSeen: true })).toBe("STAFF");
    expect(followDecision({ ...base, autoBans: 5 })).toBe("LIMIT");
    expect(followDecision({ ...base, othersActive: 1 })).toBe("SHARED");
  });

  it("ne reprend jamais une IP exemptée par l'admin", () => {
    expect(followDecision({ ...base, exempt: true })).toBe("EXEMPT");
  });

  it("réglage IPv4 coupé : seuls les /64 IPv6 sont suivis", () => {
    const v4Off = { ...base, ipv4: false };
    expect(followDecision(v4Off)).toBe("IPV4");
    expect(followDecision({ ...v4Off, ipKey: "2a01:cb00:1:2::/64" })).toBe("FOLLOW");
    // Par défaut (réglage allumé), une IPv4 se suit comme avant
    expect(SETTING_DEFAULTS["multiAccount.followDeviceIpv4"]).toBe(true);
  });
});

describe("expiration d'un ban posé par l'admin", () => {
  const now = new Date("2026-11-26T12:00:00Z");

  it("par défaut (0 jour), tout ban de l'admin est définitif", () => {
    expect(SETTING_DEFAULTS["multiAccount.ipv4BanDays"]).toBe(0);
    expect(adminBanExpiry("IP", "86.245.12.3", 0, now)).toBeNull();
  });

  it("avec une durée, seule une IPv4 expire : jamais un /64 IPv6 ni un appareil", () => {
    expect(adminBanExpiry("IP", "86.245.12.3", 90, now)).toEqual(new Date("2027-02-24T12:00:00Z"));
    expect(adminBanExpiry("IP", "2a01:cb00:1:2::/64", 90, now)).toBeNull();
    expect(adminBanExpiry("DEVICE", "a".repeat(32), 90, now)).toBeNull();
    expect(isIpv4Key("86.245.12.3")).toBe(true);
    expect(isIpv4Key("2a01:cb00:1:2::/64")).toBe(false);
  });
});

describe("écran d'un réseau banni", () => {
  it("son sceau est dans la police des sceaux", () => {
    expect(SEAL_GLYPHS).toContain(NETWORK_BAN_KANJI);
  });
});

describe("pages lisibles depuis un réseau banni", () => {
  it("laisse les textes légaux et la connexion, rien d'autre", () => {
    for (const path of ["/cgu", "/en/confidentialite", "/mentions-legales", "/cookies", "/connexion", "/en/connexion", "/connexion/mot-de-passe-oublie", "/en/connexion/reinitialiser"]) {
      expect(isNetworkGateFree(path), path).toBe(true);
    }
    // La page d'erreur de connexion montre l'écran du ban (un refus Discord y mène)
    for (const path of ["/", "/en", "/inscription", "/boosters", "/u/tristan", "/cguu", "/connexion/erreur", "/en/connexion/erreur", "/connexionx"]) {
      expect(isNetworkGateFree(path), path).toBe(false);
    }
  });
});
