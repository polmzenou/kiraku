import { deflateRawSync, inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { decodeKyaraFragment, encodeKyaraPayload, KYARA_PAYLOAD_LIMITS, toBase64Url, type InflateRaw, type KyaraPayloadJson } from "./payload";

const inflate: InflateRaw = (bytes, max) => {
  try {
    return new Uint8Array(inflateRawSync(bytes, { maxOutputLength: max }));
  } catch (e) {
    if (e instanceof RangeError || (e as { code?: string }).code === "ERR_BUFFER_TOO_LARGE") return null;
    throw e;
  }
};
const deflate = (bytes: Uint8Array) => new Uint8Array(deflateRawSync(bytes));

const NONCE = "a".repeat(43);
const ID = "2af84af1-f619-45a3-bc8b-7072d0a8fd10";
const AVATAR = "https://cdn.discordapp.com/avatars/80351110224678912/8342729096ea3675442027381ff50dfe.webp?size=128";

function json(p: Partial<KyaraPayloadJson> = {}): KyaraPayloadJson {
  return {
    v: 1,
    b: 1,
    k: ID,
    n: NONCE,
    p: "Tristan",
    a: AVATAR,
    r: "2026-11-22T14:00:00.000Z",
    t: 3,
    c: [
      [40, 2, "M"],
      [127691, 1, "L"],
      [5, 1, "C"],
    ],
    ...p,
  };
}

describe("lot du favori de l'équipe", () => {
  it("aller-retour en clair et compressé, avec ou sans « # »", () => {
    for (const fragment of [encodeKyaraPayload(json()), encodeKyaraPayload(json(), deflate), `#${encodeKyaraPayload(json(), deflate)}`]) {
      const res = decodeKyaraFragment(fragment, inflate);
      expect(res.ok).toBe(true);
      if (!res.ok) continue;
      expect(res.payload).toMatchObject({ build: 1, kyaraUserId: ID, nonce: NONCE, pseudo: "Tristan", avatarUrl: AVATAR, total: 3, copies: 4 });
      expect(res.payload.entries.map((e) => e.anilistId)).toEqual([5, 40, 127691]);
      expect(res.payload.readAt.toISOString()).toBe("2026-11-22T14:00:00.000Z");
    }
  });

  it("fusionne un personnage lu deux fois, refuse deux raretés différentes", () => {
    const twice = decodeKyaraFragment(encodeKyaraPayload(json({ c: [[40, 1, "M"], [40, 2, "M"]] })), inflate);
    expect(twice.ok && twice.payload.entries).toEqual([{ anilistId: 40, qty: 3, code: "M" }]);
    expect(decodeKyaraFragment(encodeKyaraPayload(json({ c: [[40, 1, "M"], [40, 1, "R"]] })), inflate)).toEqual({ ok: false, error: "PAYLOAD_INVALID" });
  });

  it("nettoie le pseudo et ne garde qu'un avatar servi par Discord", () => {
    const res = decodeKyaraFragment(encodeKyaraPayload(json({ p: "‮Tris\u0000tan​ ", a: "https://evil.example/avatars/1/2.png" })), inflate);
    expect(res.ok && res.payload).toMatchObject({ pseudo: "Tristan", avatarUrl: null });
    const empty = decodeKyaraFragment(encodeKyaraPayload(json({ p: " ‏ ", a: "javascript:alert(1)" })), inflate);
    expect(empty.ok && empty.payload).toMatchObject({ pseudo: null, avatarUrl: null });
  });

  it("refuse une version inconnue, un lot abîmé ou une clé de trop", () => {
    expect(decodeKyaraFragment("v2.e30", inflate)).toEqual({ ok: false, error: "PAYLOAD_VERSION" });
    expect(decodeKyaraFragment("bonjour", inflate)).toEqual({ ok: false, error: "PAYLOAD_INVALID" });
    expect(decodeKyaraFragment("v1z.AAAA", inflate)).toEqual({ ok: false, error: "PAYLOAD_INVALID" });
    expect(decodeKyaraFragment(`v1.${toBase64Url(new Uint8Array([0xff, 0xfe]))}`, inflate)).toEqual({ ok: false, error: "PAYLOAD_INVALID" });
    const extra = { ...json(), x: 1 } as unknown as KyaraPayloadJson;
    expect(decodeKyaraFragment(encodeKyaraPayload(extra), inflate)).toEqual({ ok: false, error: "PAYLOAD_INVALID" });
    for (const bad of [{ k: "pas-un-uuid" }, { n: "court" }, { c: [[40, 0, "M"]] }, { c: [[40, 1, "X"]] }, { c: [[-1, 1, "M"]] }, { r: "hier" }] as Partial<KyaraPayloadJson>[]) {
      expect(decodeKyaraFragment(encodeKyaraPayload(json(bad)), inflate), JSON.stringify(bad)).toEqual({ ok: false, error: "PAYLOAD_INVALID" });
    }
  });

  it("borne la taille : fragment, nombre d'entrées et bombe de décompression", () => {
    expect(decodeKyaraFragment(`v1.${"A".repeat(KYARA_PAYLOAD_LIMITS.fragmentChars + 1)}`, inflate)).toEqual({ ok: false, error: "PAYLOAD_TOO_LARGE" });
    const many = json({ c: Array.from({ length: KYARA_PAYLOAD_LIMITS.entries + 1 }, (_, i) => [i + 1, 1, "C"] as [number, number, "C"]) });
    expect(decodeKyaraFragment(encodeKyaraPayload(many, deflate), inflate).ok).toBe(false);
    const bomb = `v1z.${toBase64Url(deflate(new Uint8Array(KYARA_PAYLOAD_LIMITS.inflatedBytes + 10).fill(32)))}`;
    expect(bomb.length).toBeLessThan(10_000);
    expect(decodeKyaraFragment(bomb, inflate)).toEqual({ ok: false, error: "PAYLOAD_TOO_LARGE" });
  });
});
