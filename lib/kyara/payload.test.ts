import { deflateRawSync, inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { decodeKyaraFragment, KYARA_PAYLOAD_LIMITS, reviewReasonOf, type InflateRaw, type KyaraPayload, type KyaraPayloadJson } from "./payload";

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Encodage du lot, comme le favori le fait en ligne (lib/kyara/bookmarklet.ts). */
function encodeKyaraPayload(json: KyaraPayloadJson, deflateRaw?: (bytes: Uint8Array) => Uint8Array): string {
  const bytes = new TextEncoder().encode(JSON.stringify(json));
  return deflateRaw ? `v2z.${toBase64Url(deflateRaw(bytes))}` : `v2.${toBase64Url(bytes)}`;
}

const inflate: InflateRaw = (bytes, max) => {
  try {
    return new Uint8Array(inflateRawSync(bytes, { maxOutputLength: max }));
  } catch (e) {
    if (e instanceof RangeError || (e as { code?: string }).code === "ERR_BUFFER_TOO_LARGE") return null;
    throw e;
  }
};
const deflate = (bytes: Uint8Array) => new Uint8Array(deflateRawSync(bytes));

const KEY = "a".repeat(43);
const ID = "2af84af1-f619-45a3-bc8b-7072d0a8fd10";
const AVATAR = "https://cdn.discordapp.com/avatars/80351110224678912/8342729096ea3675442027381ff50dfe.webp?size=128";

function json(p: Partial<KyaraPayloadJson> = {}): KyaraPayloadJson {
  return {
    v: 2,
    b: 2,
    k: ID,
    s: KEY,
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
      expect(res.payload).toMatchObject({ build: 2, kyaraUserId: ID, key: KEY, pseudo: "Tristan", avatarUrl: AVATAR, total: 3, copies: 4 });
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

  it("refuse une version inconnue ou ancienne, un lot abîmé ou une clé de trop", () => {
    expect(decodeKyaraFragment("v3.e30", inflate)).toEqual({ ok: false, error: "PAYLOAD_VERSION" });
    // Ancien favori (code par demande) : il faut régénérer son favori
    expect(decodeKyaraFragment(`v1.${toBase64Url(new TextEncoder().encode(JSON.stringify({ ...json(), v: 1 })))}`, inflate)).toEqual({ ok: false, error: "PAYLOAD_VERSION" });
    expect(decodeKyaraFragment("bonjour", inflate)).toEqual({ ok: false, error: "PAYLOAD_INVALID" });
    expect(decodeKyaraFragment("v2z.AAAA", inflate)).toEqual({ ok: false, error: "PAYLOAD_INVALID" });
    expect(decodeKyaraFragment(`v2.${toBase64Url(new Uint8Array([0xff, 0xfe]))}`, inflate)).toEqual({ ok: false, error: "PAYLOAD_INVALID" });
    const extra = { ...json(), x: 1 } as unknown as KyaraPayloadJson;
    expect(decodeKyaraFragment(encodeKyaraPayload(extra), inflate)).toEqual({ ok: false, error: "PAYLOAD_INVALID" });
    for (const bad of [{ k: "pas-un-uuid" }, { s: "court" }, { s: "a".repeat(42) + "=" }, { c: [[40, 0, "M"]] }, { c: [[40, 1, "X"]] }, { c: [[-1, 1, "M"]] }, { r: "hier" }] as Partial<KyaraPayloadJson>[]) {
      expect(decodeKyaraFragment(encodeKyaraPayload(json(bad)), inflate), JSON.stringify(bad)).toEqual({ ok: false, error: "PAYLOAD_INVALID" });
    }
  });

  it("borne la taille : fragment, nombre d'entrées et bombe de décompression", () => {
    expect(decodeKyaraFragment(`v2.${"A".repeat(KYARA_PAYLOAD_LIMITS.fragmentChars + 1)}`, inflate)).toEqual({ ok: false, error: "PAYLOAD_TOO_LARGE" });
    const many = json({ c: Array.from({ length: KYARA_PAYLOAD_LIMITS.entries + 1 }, (_, i) => [i + 1, 1, "C"] as [number, number, "C"]) });
    expect(decodeKyaraFragment(encodeKyaraPayload(many, deflate), inflate).ok).toBe(false);
    const bomb = `v2z.${toBase64Url(deflate(new Uint8Array(KYARA_PAYLOAD_LIMITS.inflatedBytes + 10).fill(32)))}`;
    expect(bomb.length).toBeLessThan(10_000);
    expect(decodeKyaraFragment(bomb, inflate)).toEqual({ ok: false, error: "PAYLOAD_TOO_LARGE" });
  });

  it("favori 4 : complétude, éléments écartés et ids de repli lus ; absents (favori 3) : inconnus", () => {
    const v4 = decodeKyaraFragment(encodeKyaraPayload(json({ b: 4, e: true, d: 2, f: 1 }), deflate), inflate);
    expect(v4.ok && v4.payload).toMatchObject({ build: 4, complete: true, dropped: 2, idFallbacks: 1 });
    const v3 = decodeKyaraFragment(encodeKyaraPayload(json({ b: 3 })), inflate);
    expect(v3.ok && v3.payload).toMatchObject({ complete: null, dropped: null, idFallbacks: null });
    for (const bad of [{ e: "oui" }, { d: -1 }, { f: 1.5 }] as unknown as Partial<KyaraPayloadJson>[]) {
      expect(decodeKyaraFragment(encodeKyaraPayload(json(bad)), inflate), JSON.stringify(bad)).toEqual({ ok: false, error: "PAYLOAD_INVALID" });
    }
  });
});

describe("lecture douteuse : jamais versée d'office", () => {
  const entries = [
    { anilistId: 5, qty: 1, code: "C" as const },
    { anilistId: 40, qty: 2, code: "M" as const },
  ];
  const sure: Pick<KyaraPayload, "avatarUrl" | "total" | "entries" | "complete" | "dropped" | "idFallbacks"> = {
    avatarUrl: AVATAR,
    total: 2,
    entries,
    complete: true,
    dropped: 0,
    idFallbacks: 0,
  };

  it("lecture complète du favori 4, total annoncé et atteint : versée", () => {
    expect(reviewReasonOf(sure)).toBeNull();
    // Kyara compte moins qu'on a lu (copies fusionnées) : rien ne manque
    expect(reviewReasonOf({ ...sure, total: 1 })).toBeNull();
  });

  it("chaque doute a son motif, dans l'ordre", () => {
    expect(reviewReasonOf({ ...sure, avatarUrl: "https://cdn.discordapp.com/embed/avatars/2.png" })).toBe("DISCORD_UNVERIFIED");
    expect(reviewReasonOf({ ...sure, entries: [] })).toBe("EMPTY");
    expect(reviewReasonOf({ ...sure, complete: null, dropped: null, idFallbacks: null })).toBe("OLD_BOOKMARKLET");
    expect(reviewReasonOf({ ...sure, dropped: null })).toBe("OLD_BOOKMARKLET");
    // Arrêtée au plafond de pages du favori
    expect(reviewReasonOf({ ...sure, complete: false })).toBe("TRUNCATED");
    expect(reviewReasonOf({ ...sure, dropped: 1 })).toBe("DROPPED");
    expect(reviewReasonOf({ ...sure, idFallbacks: 3 })).toBe("ID_FALLBACK");
    expect(reviewReasonOf({ ...sure, total: null })).toBe("TOTAL_UNKNOWN");
    expect(reviewReasonOf({ ...sure, total: 3 })).toBe("TRUNCATED");
    expect(reviewReasonOf({ ...sure, complete: false, dropped: 1, total: null })).toBe("TRUNCATED");
  });
});
