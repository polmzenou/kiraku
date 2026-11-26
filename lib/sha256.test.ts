import { createHash, createHmac, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { bytesToHex, hexToBytes, hmacSha256, sha256 } from "./sha256";

// SHA-256 et HMAC en TypeScript pur : mêmes octets que node:crypto, autour des limites de bloc (55, 56, 63, 64, 65…).

const LENGTHS = [0, 1, 3, 31, 32, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 129, 200, 1_000];

describe("sha256", () => {
  it("vecteurs connus", () => {
    expect(bytesToHex(sha256(new Uint8Array()))).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(bytesToHex(sha256(new TextEncoder().encode("abc")))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("même empreinte que node:crypto, quelle que soit la longueur", () => {
    for (const length of LENGTHS) {
      const data = randomBytes(length);
      expect(bytesToHex(sha256(data))).toBe(createHash("sha256").update(data).digest("hex"));
    }
  });
});

describe("hmacSha256", () => {
  it("vecteur de la RFC 4231 (cas 2)", () => {
    const mac = hmacSha256(new TextEncoder().encode("Jefe"), new TextEncoder().encode("what do ya want for nothing?"));
    expect(bytesToHex(mac)).toBe("5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843");
  });

  it("même HMAC que node:crypto, clés courtes, de 64 octets et longues (hachées)", () => {
    for (const keyLength of [0, 1, 32, 63, 64, 65, 100]) {
      for (const length of LENGTHS) {
        const key = randomBytes(keyLength);
        const message = randomBytes(length);
        expect(bytesToHex(hmacSha256(key, message))).toBe(createHmac("sha256", key).update(message).digest("hex"));
      }
    }
  });
});

describe("hexadécimal", () => {
  it("aller-retour, majuscules acceptées, refus de ce qui n'en est pas", () => {
    const bytes = randomBytes(32);
    expect(bytesToHex(hexToBytes(bytesToHex(bytes)))).toBe(bytes.toString("hex"));
    expect(bytesToHex(hexToBytes("ABcd"))).toBe("abcd");
    expect(() => hexToBytes("abc")).toThrow();
    expect(() => hexToBytes("zz")).toThrow();
  });
});
