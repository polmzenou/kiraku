import { z } from "@/lib/zod";
import { KYARA_CODES, KYARA_PAYLOAD_VERSION, type KyaraCode } from "./codes";
import { mergeEntries, type KyaraEntry } from "./plan";
import { isKyaraUserId } from "./profile-url";

// Lot envoyé par le favori de l'équipe, de Kyara vers /admin/kyara/recevoir#<lot> : « v2. » + base64url(JSON),
// ou « v2z. » + base64url(deflate-raw(JSON)). Le fragment d'une URL ne part vers aucun serveur : la page de
// réception le lit, l'efface et l'envoie à l'action. Tout est revérifié ici, bornes comprises, et la donnée
// n'est de toute façon versée qu'après la vérification de la clé du membre de l'équipe et du compte Discord.
//
// JSON : { v: 2, b: version du favori, k: uuid du profil lu, s: clé du favori du membre de l'équipe, p: pseudo Kyara,
//          a: avatar Kyara, r: lu le (ISO), t: total annoncé par Kyara ou null, c: [[anilistId, quantité, code]] }
// v1 (code par demande, #kiraku=…) n'est plus accepté : PAYLOAD_VERSION, il faut régénérer son favori.

export const KYARA_PAYLOAD_LIMITS = { fragmentChars: 700_000, inflatedBytes: 2_000_000, entries: 20_000 } as const;
/** Clé du favori d'un membre de l'équipe : 32 octets en base64url. */
export const KYARA_STAFF_KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const entrySchema = z.tuple([z.number().int().min(1).max(2_147_483_647), z.number().int().min(1).max(100_000), z.enum(KYARA_CODES)]);

const payloadSchema = z
  .object({
    v: z.literal(KYARA_PAYLOAD_VERSION),
    b: z.number().int().min(1).max(10_000),
    k: z.string().refine(isKyaraUserId),
    s: z.string().regex(KYARA_STAFF_KEY_PATTERN),
    p: z.string().max(200).nullable(),
    a: z.string().max(500).nullable(),
    r: z.string().datetime(),
    t: z.number().int().min(0).max(1_000_000).nullable(),
    c: z.array(entrySchema).max(KYARA_PAYLOAD_LIMITS.entries),
  })
  .strict();

export type KyaraPayloadJson = z.input<typeof payloadSchema>;

export type KyaraPayload = {
  build: number;
  kyaraUserId: string;
  /** Clé du favori qui a lu la collection (vérifiée contre KyaraStaffKey). */
  key: string;
  pseudo: string | null;
  avatarUrl: string | null;
  readAt: Date;
  /** Total annoncé par Kyara (personnages distincts), pour repérer une lecture tronquée. */
  total: number | null;
  /** Une entrée par personnage, triée. */
  entries: KyaraEntry[];
  /** Exemplaires lus, copies comprises. */
  copies: number;
};

export type KyaraDecodeError = "PAYLOAD_INVALID" | "PAYLOAD_TOO_LARGE" | "PAYLOAD_VERSION";

/** Photo d'une collection lue, gardée en base (KyaraImport.snapshot) : [[anilistId, quantité, code]]. */
export function snapshotOf(entries: readonly KyaraEntry[]): [number, number, KyaraCode][] {
  return entries.map((e) => [e.anilistId, e.qty, e.code]);
}

const snapshotSchema = z.array(entrySchema).max(KYARA_PAYLOAD_LIMITS.entries);

/** Photo relue en base : une entrée par personnage, ou null si elle a été abîmée. */
export function parseSnapshot(json: unknown): KyaraEntry[] | null {
  const parsed = snapshotSchema.safeParse(json);
  return parsed.success ? mergeEntries(parsed.data.map(([anilistId, qty, code]) => ({ anilistId, qty, code }))) : null;
}

/** Décompression deflate-raw bornée : null si le résultat dépasserait maxBytes, exception si les données sont abîmées. */
export type InflateRaw = (bytes: Uint8Array, maxBytes: number) => Uint8Array | null;

const CONTROL_OR_BIDI = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g;

function cleanPseudo(value: string | null): string | null {
  const clean = value?.replace(CONTROL_OR_BIDI, "").trim().slice(0, 64) ?? "";
  return clean.length > 0 ? clean : null;
}

/** Seuls les avatars servis par Discord sont gardés (affichés dans l'admin, lus pour l'ID Discord). */
function cleanAvatar(value: string | null): string | null {
  if (value === null) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "cdn.discordapp.com" || url.hostname === "media.discordapp.net") ? url.href : null;
  } catch {
    return null;
  }
}

function fromBase64Url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Encodage du lot (tests et variante console du favori, qui fait la même chose en ligne). */
export function encodeKyaraPayload(json: KyaraPayloadJson, deflateRaw?: (bytes: Uint8Array) => Uint8Array): string {
  const bytes = new TextEncoder().encode(JSON.stringify(json));
  return deflateRaw ? `v2z.${toBase64Url(deflateRaw(bytes))}` : `v2.${toBase64Url(bytes)}`;
}

export function decodeKyaraFragment(
  fragment: string,
  inflateRaw: InflateRaw,
): { ok: true; payload: KyaraPayload } | { ok: false; error: KyaraDecodeError } {
  const raw = fragment.trim().replace(/^#/, "");
  if (raw.length > KYARA_PAYLOAD_LIMITS.fragmentChars) return { ok: false, error: "PAYLOAD_TOO_LARGE" };
  const m = /^v(\d{1,3})(z?)\.([A-Za-z0-9_-]+)$/.exec(raw);
  if (!m) return { ok: false, error: "PAYLOAD_INVALID" };
  if (Number(m[1]) !== KYARA_PAYLOAD_VERSION) return { ok: false, error: "PAYLOAD_VERSION" };

  let bytes: Uint8Array;
  try {
    bytes = fromBase64Url(m[3]);
    if (m[2] === "z") {
      const inflated = inflateRaw(bytes, KYARA_PAYLOAD_LIMITS.inflatedBytes);
      if (inflated === null) return { ok: false, error: "PAYLOAD_TOO_LARGE" };
      bytes = inflated;
    }
  } catch {
    return { ok: false, error: "PAYLOAD_INVALID" };
  }
  if (bytes.length > KYARA_PAYLOAD_LIMITS.inflatedBytes) return { ok: false, error: "PAYLOAD_TOO_LARGE" };

  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return { ok: false, error: "PAYLOAD_INVALID" };
  }
  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) return { ok: false, error: "PAYLOAD_INVALID" };
  const data = parsed.data;

  // Un même personnage avec deux raretés : lecture incohérente, rien n'est gardé
  const codes = new Map<number, KyaraCode>();
  for (const [id, , code] of data.c) {
    const known = codes.get(id);
    if (known !== undefined && known !== code) return { ok: false, error: "PAYLOAD_INVALID" };
    codes.set(id, code);
  }
  const entries = mergeEntries(data.c.map(([anilistId, qty, code]) => ({ anilistId, qty, code })));
  return {
    ok: true,
    payload: {
      build: data.b,
      kyaraUserId: data.k.toLowerCase(),
      key: data.s,
      pseudo: cleanPseudo(data.p),
      avatarUrl: cleanAvatar(data.a),
      readAt: new Date(data.r),
      total: data.t,
      entries,
      copies: entries.reduce((sum, e) => sum + e.qty, 0),
    },
  };
}
