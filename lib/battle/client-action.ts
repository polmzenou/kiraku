import { z } from "@/lib/zod";
import { TEAM_SIZE } from "./types";

// Ce que le client peut demander en partie : une intention et des index, jamais le camp (celui de la
// session) ni un effet. Le moteur revérifie la légalité du coup (server/battle/battle-core.ts).

const slot = z.number().int().min(0).max(TEAM_SIZE - 1);

export const clientActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ATTACK"), actor: slot, target: slot }).strict(),
  z.object({ type: z.literal("TECHNIQUE"), actor: slot, target: slot.optional() }).strict(),
  z.object({ type: z.literal("ULTIMATE"), actor: slot, target: slot.optional() }).strict(),
  z.object({ type: z.literal("END_TURN") }).strict(),
  z.object({ type: z.literal("FORFEIT") }).strict(),
]);

export type ClientAction = z.infer<typeof clientActionSchema>;
