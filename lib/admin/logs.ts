import { z } from "@/lib/zod";
import { endOfLocalDay, localMidnight } from "../economy/period";
import { USERNAME_REGEX } from "../username";

// Filtres du journal /admin/journal, lus dans l'URL (formulaire GET) : tout paramètre invalide est ignoré.

export const ADMIN_LOG_PAGE_SIZE = 50;

const optional = <T extends z.ZodType>(schema: T) => z.preprocess((v) => (Array.isArray(v) ? v[0] : v), schema.optional().catch(undefined));
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)));

const paramsSchema = z.object({
  action: optional(z.string().trim().toUpperCase().regex(/^[A-Z_]{1,40}$/)),
  type: optional(z.string().trim().regex(/^[A-Za-z]{1,30}$/)),
  target: optional(z.string().trim().regex(/^[A-Za-z0-9_:.-]{1,80}$/)),
  admin: optional(z.string().trim().regex(USERNAME_REGEX)),
  from: optional(day),
  to: optional(day),
  cursor: optional(z.string().regex(/^[A-Za-z0-9_-]{1,40}$/)),
});

export type AdminLogParams = z.infer<typeof paramsSchema>;

export function parseAdminLogParams(raw: Record<string, string | string[] | undefined>): AdminLogParams {
  const parsed = paramsSchema.safeParse(raw);
  return parsed.success ? parsed.data : {};
}

/**
 * Bornes de dates dans le fuseau des heures affichées (`timeZone`, celui du jeu) : de minuit le jour `from` à minuit
 * le lendemain de `to` (inclus). En UTC, une action du 27 à 0 h 30 à Paris tombait dans le filtre du 26.
 */
export function dateRange(params: Pick<AdminLogParams, "from" | "to">, timeZone: string): { gte?: Date; lt?: Date } {
  const range: { gte?: Date; lt?: Date } = {};
  if (params.from) {
    const [year, month, day] = params.from.split("-").map(Number);
    range.gte = localMidnight({ year, month, day }, timeZone);
  }
  const end = params.to ? endOfLocalDay(params.to, timeZone) : null;
  if (end) range.lt = end;
  return range;
}

/** Paramètres de l'URL sans le curseur (filtres conservés d'une page à l'autre). */
export function logQuery(params: AdminLogParams, cursor?: string): Record<string, string> {
  const query: Record<string, string> = {};
  for (const key of ["action", "type", "target", "admin", "from", "to"] as const) {
    const v = params[key];
    if (v) query[key] = v;
  }
  if (cursor) query.cursor = cursor;
  return query;
}
