import { z } from "@/lib/zod";

export const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const EFFECTS = ["holographic", "gold", "pearl", "sparkles", "aura"] as const;
export const appearanceSchema = z.object({
  frame: hexColor.optional(), paper: hexColor.optional(), ink: hexColor.optional(), seal: z.string().trim().max(8).optional(),
  focalX: z.number().min(0).max(100).optional(), focalY: z.number().min(0).max(100).optional(),
  zoom: z.number().min(1).max(3).optional(), effects: z.array(z.enum(EFFECTS)).max(5).optional(),
  effectColor: hexColor.optional(), intensity: z.number().min(0).max(1).optional(),
  speed: z.number().min(0.2).max(5).optional(), reactive: z.boolean().optional(),
  tilt: z.number().min(0).max(30).optional(), reveal: z.enum(["flip", "fade", "zoom"]).optional(),
  duration: z.number().min(0.1).max(3).optional(), delay: z.number().min(0).max(3).optional(),
  easing: z.enum(["easeOut", "easeInOut", "linear"]).optional(),
  /** Artwork doré (rareté Gold) : filtre et calque or posés sur l'image. */
  artTone: z.enum(["natural", "gold"]).optional(),
  /** Full Art (XR) : l'illustration couvre le cadre, le nom est posé dessus. */
  fullArt: z.boolean().optional(),
  /** Full Art : personnage détouré (fond transparent, même cadrage que l'image), posé devant le cadre et sous le nom. */
  cutoutUrl: z.string().max(2048).optional(),
}).strict();
export type CardAppearance = z.infer<typeof appearanceSchema>;
export function parseAppearance(raw: unknown): CardAppearance {
  const result = appearanceSchema.safeParse(raw);
  return result.success ? result.data : {};
}
export const APPEARANCE_DEFAULTS = {
  focalX: 50, focalY: 0, zoom: 1, effectColor: "#f7c75d", intensity: 0.45,
  speed: 1, reactive: true, tilt: 16, reveal: "flip", duration: 0.5, delay: 0, easing: "easeOut",
} satisfies CardAppearance;
const merge = (base: unknown, card: unknown) => ({ ...APPEARANCE_DEFAULTS, ...parseAppearance(base), ...parseAppearance(card) });
type ResolvedAppearance = ReturnType<typeof merge>;

// Chaque fuda résout son apparence à chaque rendu (deux validations Zod) : on garde le résultat par
// couple d'objets (rareté, carte), qui restent les mêmes tant que le catalogue ne change pas.
const NONE = {};
const resolved = new WeakMap<object, WeakMap<object, ResolvedAppearance>>();
const key = (value: unknown): object | null => (value === undefined || value === null ? NONE : typeof value === "object" ? value : null);

export function resolveAppearance(base: unknown, card: unknown): ResolvedAppearance {
  const baseKey = key(base);
  const cardKey = key(card);
  if (!baseKey || !cardKey) return merge(base, card);
  let byCard = resolved.get(baseKey);
  if (!byCard) resolved.set(baseKey, (byCard = new WeakMap()));
  let value = byCard.get(cardKey);
  if (!value) byCard.set(cardKey, (value = merge(base, card)));
  return value;
}

const MATERIAL_COLORS: Record<string, string> = { COMMON: "#897e6d", UNCOMMON: "#618d68", RARE: "#557ca5", EPIC: "#9872bc", LEGENDARY: "#c8a140", MYTHIC: "#d4a9c8", AR: "#f08ab0", GOLD: "#d9b556", MR: "#d8d3c8", VR: "#a98be0", XR: "#e0609f", BR: "#a8a5a3" };

/** Préréglages des raretés visuelles : mêmes valeurs que la migration raretes_visuelles. */
export const VISUAL_PRESETS = {
  MR: { effects: ["holographic"], intensity: 0.25 },
  VR: { effects: ["holographic"], intensity: 0.25 },
  XR: { fullArt: true, effects: ["holographic"], intensity: 0.25 },
  BR: { effects: ["holographic"], intensity: 0.25 },
} satisfies Record<string, CardAppearance>;

/** Couleur d'une rareté (teinte du grand moment) : cadre réglé dans l'admin, sinon celui de sa matière. */
export function rarityColor(key: string, appearance: unknown): string {
  return parseAppearance(appearance).frame ?? MATERIAL_COLORS[key] ?? "#c8a140";
}

/** Concrete versions of the existing CSS materials when starting a new rarity. */
export function materialAppearance(key: string): CardAppearance {
  const colors = MATERIAL_COLORS;
  const effects: Record<string, CardAppearance["effects"]> = { MYTHIC: ["pearl", "holographic"], LEGENDARY: ["gold"], EPIC: ["pearl"], AR: ["holographic", "sparkles"], GOLD: ["gold", "sparkles"] };
  const preset: CardAppearance | undefined = VISUAL_PRESETS[key as keyof typeof VISUAL_PRESETS];
  return { frame: colors[key] || "#897e6d", effects: effects[key] ?? [], ...(key === "GOLD" && { artTone: "gold" as const }), ...preset };
}
