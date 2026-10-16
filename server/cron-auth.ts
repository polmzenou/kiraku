import "server-only";
import { timingSafeEqual } from "node:crypto";
import { env } from "./env";

/** Vercel Cron envoie « Authorization: Bearer $CRON_SECRET » ; sans secret configuré, tout est refusé. */
export function cronAuthorized(header: string | null): boolean {
  if (!env.CRON_SECRET || !header) return false;
  const expected = Buffer.from(`Bearer ${env.CRON_SECRET}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
