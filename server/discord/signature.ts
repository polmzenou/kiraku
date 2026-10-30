import { createPublicKey, verify } from "node:crypto";

/** Signature du corps brut, avant JSON.parse ; fenêtre courte contre les rejeux anciens. */
export function validDiscordSignature(body: Buffer, signature: string | null, timestamp: string | null, publicKey: string, now = Date.now()): boolean {
  if (!signature || !/^[a-f0-9]{128}$/i.test(signature) || !timestamp || !/^\d{10}$/.test(timestamp) || !/^[a-f0-9]{64}$/i.test(publicKey)) return false;
  const age = now - Number(timestamp) * 1000;
  if (age > 300_000 || age < -30_000) return false;
  try {
    const key = createPublicKey({ key: Buffer.from(`302a300506032b6570032100${publicKey}`, "hex"), format: "der", type: "spki" });
    return verify(null, Buffer.concat([Buffer.from(timestamp), body]), key, Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}

export async function discordRequestBody(request: Request): Promise<Buffer | null> {
  const limit = 64 * 1024;
  if (Number(request.headers.get("content-length")) > limit) return null;
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return Buffer.concat(chunks);
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
}
