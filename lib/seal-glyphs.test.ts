import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { STEP_KANJI } from "@/components/referral/step-meta";
import { SEALED_TEASER } from "@/components/welcome/sealed-teaser";
import { NETWORK_BAN_KANJI } from "@/lib/anticheat/network";
import { ARENA_KANJI } from "@/lib/battle/arenas";
import { newBannerForm, newFocusForm } from "@/lib/boosters/admin-form";
import { SIDE_KANJI } from "@/lib/casino/media";
import { RARITY_SEAL } from "@/lib/catalog/rarity";
import { OMIKUJI_LUCK } from "@/lib/ennichi/omikuji";
import { TIER_KANJI } from "@/lib/ennichi/rules";
import { KYARA_SEAL } from "@/lib/kyara/codes";
import { ONE_OF_ONE_SEAL } from "@/lib/prestige/printing";
import { BADGE_KANJI } from "@/lib/profile/badges";
import { FRAME_KANJI } from "@/lib/profile/frames";
import { SEAL_GLYPHS } from "@/lib/seal-glyphs";
import { SETTING_DEFAULTS } from "@/lib/settings/defaults";
import { SHOWCASE_THEMES } from "@/lib/showcase/theme-registry";

// Un kanji absent du sous-ensemble de Yuji Syuku s'affiche dans une police de secours : chaque sceau doit être
// dans lib/seal-glyphs.ts (puis npm run fonts:subset et npm run fonts:og). Les constantes déjà vérifiées à côté
// de leur module (combat, succès, boosters, nouveautés, navigation) ne sont pas reprises ici.

const missing = (glyphs: string) => [...new Set(glyphs)].filter((c) => !SEAL_GLYPHS.includes(c));

describe("police des sceaux", () => {
  it.each([
    ["badges du profil", Object.values(BADGE_KANJI).join("")],
    ["cadres d'avatar", Object.values(FRAME_KANJI).join("")],
    ["décors des vitrines", Object.values(SHOWCASE_THEMES).map((t) => t.kanji).join("")],
    ["raretés", Object.values(RARITY_SEAL).join("")],
    ["arènes", Object.values(ARENA_KANJI).join("")],
    ["faces de la pièce", Object.values(SIDE_KANJI).join("")],
    ["sorts de l'omikuji", OMIKUJI_LUCK.join("")],
    ["paliers des lanternes", TIER_KANJI.join("")],
    ["étapes du parrainage", STEP_KANJI.join("")],
    ["sachets scellés annoncés", SEALED_TEASER.map((s) => s.emblem).join("")],
    ["emblèmes proposés à la création d'un booster", newBannerForm().emblem + newFocusForm().emblem],
    ["sceaux des tirages (défaut et 1/1)", Object.values(SETTING_DEFAULTS["prestige.printing.seals"]).join("") + ONE_OF_ONE_SEAL],
    ["import Kyara", KYARA_SEAL],
    ["réseau banni", NETWORK_BAN_KANJI],
  ])("trace les sceaux : %s", (_, glyphs) => {
    expect(glyphs.length).toBeGreaterThan(0);
    expect(missing(glyphs)).toEqual([]);
  });

  // Kanji et kana écrits dans le code des pages et des composants (titres de section, sceaux, CSS), hors commentaires :
  // tous passent par la police des sceaux, sauf ces exceptions dessinées dans une autre police.
  const OTHER_FONT: Record<string, string> = {
    "components/battle/sandbox/BattleSandbox.tsx": "茜黒鉄玄海琥珀", // noms natifs des cartes de démonstration (Mincho de la fuda)
    "components/fuda/Fuda.tsx": "・", // séparateur repéré dans les noms, jamais affiché seul
  };
  const CJK = /[぀-ヿ㐀-鿿豈-﫿]/u;

  function sources(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const path = join(dir, e.name);
      if (e.isDirectory()) return sources(path);
      return /\.(tsx?|css)$/.test(e.name) && !e.name.endsWith(".test.ts") ? [path] : [];
    });
  }

  it("trace chaque kanji écrit en dur dans app/ et components/", () => {
    const found: Record<string, string> = {};
    for (const file of [...sources("app"), ...sources("components")]) {
      const name = file.replace(/\\/g, "/");
      // Commentaires retirés : blocs /* … */ (dont {/* … */} en JSX), puis lignes // (pas les « :// » des URL)
      const code = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(?<![:\\])\/\/.*$/gm, "");
      const allowed = OTHER_FONT[name] ?? "";
      const absent = missing([...code].filter((c) => CJK.test(c) && !allowed.includes(c)).join(""));
      if (absent.length > 0) found[name] = absent.join("");
    }
    expect(found).toEqual({});
  });
});
