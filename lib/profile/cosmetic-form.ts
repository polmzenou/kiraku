import { z } from "@/lib/zod";
import { conditionSchema } from "./conditions";
import { FRAME_STYLES } from "./frames";
import { NAME_COLOR_STYLES } from "./name-colors";

// Formulaire admin d'un titre, d'un cadre ou d'une couleur de pseudo (/admin/cosmetiques). Le serveur revalide tout.

const text = (max: number) => z.string().trim().max(max);

export const cosmeticInputSchema = z
  .object({
    id: z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/).nullable(),
    kind: z.enum(["TITLE", "FRAME", "NAME_COLOR"]),
    slug: z.string().trim().min(2).max(40).regex(/^[a-z0-9-]+$/),
    label: z.object({ fr: text(60).min(1), frFem: text(60), en: text(60) }).strict(),
    hint: z.object({ fr: text(160), en: text(160) }).strict(),
    frameStyle: z.enum(FRAME_STYLES).nullable(),
    nameColor: z.enum(NAME_COLOR_STYLES).nullable(),
    condition: conditionSchema,
    sortOrder: z.number().int().min(-10_000).max(10_000),
    active: z.boolean(),
  })
  .strict()
  .refine((c) => (c.kind === "FRAME") === (c.frameStyle !== null), { message: "Un cadre a un style, le reste n'en a pas" })
  .refine((c) => (c.kind === "NAME_COLOR") === (c.nameColor !== null), { message: "Une couleur de pseudo a un style, le reste n'en a pas" });

export type CosmeticInput = z.infer<typeof cosmeticInputSchema>;
