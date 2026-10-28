import type { BoosterTheme } from "@/lib/boosters/types";

// Sachets scellés présentés par les annonces : seuls le sachet et le nom sont dévoilés. Divin : ivoire
// et rayons d'or (後光), à ne pas confondre avec la nacre lilas du booster Mythique.
export const SEALED_TEASER: { key: "divine" | "apocalypse"; emblem: string; theme: BoosterTheme }[] = [
  { key: "divine", emblem: "天", theme: { base: "#FBF5E4", dark: "#B58A2C", pattern: "goko", ink: "dark" } },
  { key: "apocalypse", emblem: "滅", theme: { base: "#4A0F0B", dark: "#0E0505", pattern: "kumo", ink: "light" } },
];
