import { inflateRawSync } from "node:zlib";
import { decodeKyaraFragment, type InflateRaw } from "@/lib/kyara/payload";

// Décompression du lot du favori, bornée (bombe de décompression) : null si le résultat dépasserait la borne.

export const inflateRawBounded: InflateRaw = (bytes, maxBytes) => {
  try {
    return new Uint8Array(inflateRawSync(bytes, { maxOutputLength: maxBytes }));
  } catch (e) {
    if (e instanceof RangeError || (e as { code?: string }).code === "ERR_BUFFER_TOO_LARGE") return null;
    throw e;
  }
};

export function decodeFragment(fragment: string) {
  return decodeKyaraFragment(fragment, inflateRawBounded);
}
