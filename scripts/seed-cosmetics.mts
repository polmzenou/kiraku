// Ajoute seulement les titres et cadres de départ manquants ; ceux édités dans l'admin sont conservés.
// Usage : npm run seed:cosmetics
import { config } from "dotenv";
import { PrismaClient, type Prisma } from "../generated/prisma/client.ts";
import { createPgAdapter } from "../server/pg-adapter.ts";

config({ path: [".env.local", ".env"], quiet: true });
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL manquante");
const prisma = new PrismaClient({ adapter: createPgAdapter(connectionString) });

type Seed = {
  slug: string;
  kind: "TITLE" | "FRAME";
  label: { fr: string; frFem?: string; en: string };
  hint: { fr: string; en: string };
  frameStyle?: string;
  condition: Prisma.InputJsonValue;
};

/** Série la plus fournie d'une œuvre (anime et manga peuvent coexister sous le même titre). */
async function seriesId(title: string): Promise<string | null> {
  const rows = await prisma.series.findMany({
    where: { OR: [{ titleRomaji: { equals: title, mode: "insensitive" } }, { titleEnglish: { equals: title, mode: "insensitive" } }] },
    select: { id: true, _count: { select: { cards: { where: { status: "PUBLISHED" } } } } },
  });
  return rows.sort((a, b) => b._count.cards - a._count.cards)[0]?.id ?? null;
}

/** Titres de complétion d'une série : `title` sert à retrouver la série, `name` au texte de l'indice. */
const SERIES_TITLES: { slug: string; title: string; name: string; label: Seed["label"] }[] = [
  { slug: "devil-hunter", title: "Chainsaw Man", name: "Chainsaw Man", label: { fr: "Devil Hunter", en: "Devil Hunter" } },
  { slug: "roi-des-pirates", title: "ONE PIECE", name: "One Piece", label: { fr: "Roi des pirates", frFem: "Reine des pirates", en: "Pirate King" } },
  { slug: "roi-spirituel", title: "BLEACH", name: "Bleach", label: { fr: "Roi spirituel", frFem: "Reine spirituelle", en: "Soul King" } },
  { slug: "empereur-mage", title: "Black Clover", name: "Black Clover", label: { fr: "Empereur-Mage", frFem: "Impératrice-Mage", en: "Wizard King" } },
  { slug: "roi-borgne", title: "Tokyo Ghoul", name: "Tokyo Ghoul", label: { fr: "Roi borgne", frFem: "Reine borgne", en: "One-Eyed King" } },
  { slug: "grade-special", title: "Jujutsu Kaisen", name: "Jujutsu Kaisen", label: { fr: "Exorciste de grade spécial", en: "Special Grade Sorcerer" } },
  { slug: "pilier", title: "Kimetsu no Yaiba", name: "Demon Slayer", label: { fr: "Pilier", en: "Hashira" } },
  { slug: "super-saiyan", title: "Dragon Ball Z", name: "Dragon Ball Z", label: { fr: "Super Saiyan", en: "Super Saiyan" } },
  { slug: "alchimiste-etat", title: "Fullmetal Alchemist: Brotherhood", name: "Fullmetal Alchemist: Brotherhood", label: { fr: "Alchimiste d'État", en: "State Alchemist" } },
  { slug: "eclaireur", title: "Shingeki no Kyojin", name: "L'Attaque des Titans", label: { fr: "Éclaireur", frFem: "Éclaireuse", en: "Scout" } },
  { slug: "manieur-de-stand", title: "JoJo no Kimyou na Bouken (TV)", name: "JoJo's Bizarre Adventure", label: { fr: "Manieur de Stand", frFem: "Manieuse de Stand", en: "Stand User" } },
];

try {
  const absent: string[] = [];
  const seriesSeeds: Seed[] = [];
  for (const s of SERIES_TITLES) {
    const id = await seriesId(s.title);
    if (!id) {
      absent.push(s.name);
      continue;
    }
    seriesSeeds.push({ slug: s.slug, kind: "TITLE", label: s.label, hint: { fr: `Compléter la série ${s.name}.`, en: `Complete the ${s.name} series.` }, condition: { type: "SERIES_COMPLETE", seriesId: id } });
  }
  const seeds: Seed[] = [
    { slug: "premiers-pas", kind: "TITLE", label: { fr: "Apprenti collectionneur", frFem: "Apprentie collectionneuse", en: "Apprentice collector" }, hint: { fr: "Posséder 50 cartes uniques.", en: "Own 50 unique cards." }, condition: { type: "UNIQUE_CARDS", n: 50 } },
    { slug: "gardien-archives", kind: "TITLE", label: { fr: "Gardien des archives", frFem: "Gardienne des archives", en: "Keeper of the archives" }, hint: { fr: "Posséder 1 000 cartes uniques.", en: "Own 1,000 unique cards." }, condition: { type: "UNIQUE_CARDS", n: 1000 } },
    { slug: "main-benie", kind: "TITLE", label: { fr: "Main bénie", en: "Blessed hand" }, hint: { fr: "Posséder une carte Mythique.", en: "Own a Mythic card." }, condition: { type: "RARITY_OWNED", rarity: "MYTHIC", n: 1 } },
    { slug: "pelerin", kind: "TITLE", label: { fr: "Pèlerin des sachets", frFem: "Pèlerine des sachets", en: "Booster pilgrim" }, hint: { fr: "Ouvrir 1 000 boosters.", en: "Open 1,000 boosters." }, condition: { type: "BOOSTERS_OPENED", n: 1000 } },
    { slug: "survivant-apocalypse", kind: "TITLE", label: { fr: "Survivant de l'Apocalypse", frFem: "Survivante de l'Apocalypse", en: "Apocalypse survivor" }, hint: { fr: "Ouvrir un booster apocalyptique ruiné.", en: "Open a ruined apocalyptic booster." }, condition: { type: "APOCALYPSE_RUINED", n: 1 } },
    { slug: "negociant", kind: "TITLE", label: { fr: "Négociant", frFem: "Négociante", en: "Trader" }, hint: { fr: "Réussir 25 échanges.", en: "Complete 25 trades." }, condition: { type: "TRADES_DONE", n: 25 } },
    ...seriesSeeds,
    { slug: "cadre-washi", kind: "FRAME", label: { fr: "Washi", en: "Washi" }, hint: { fr: "Offert à tous.", en: "Free for everyone." }, frameStyle: "washi", condition: { type: "ALWAYS" } },
    { slug: "cadre-bambou", kind: "FRAME", label: { fr: "Bambou", en: "Bamboo" }, hint: { fr: "Ouvrir 100 boosters.", en: "Open 100 boosters." }, frameStyle: "bambou", condition: { type: "BOOSTERS_OPENED", n: 100 } },
    { slug: "cadre-aizome", kind: "FRAME", label: { fr: "Aizome", en: "Aizome" }, hint: { fr: "Posséder 250 cartes uniques.", en: "Own 250 unique cards." }, frameStyle: "aizome", condition: { type: "UNIQUE_CARDS", n: 250 } },
    { slug: "cadre-urushi", kind: "FRAME", label: { fr: "Urushi", en: "Urushi" }, hint: { fr: "Atteindre le rang Or en classé.", en: "Reach Gold in ranked." }, frameStyle: "urushi", condition: { type: "RANK_TIER", tier: "GOLD" } },
    { slug: "cadre-kinpaku", kind: "FRAME", label: { fr: "Kinpaku", en: "Kinpaku" }, hint: { fr: "Posséder 5 Légendaires différentes.", en: "Own 5 different Legendaries." }, frameStyle: "kinpaku", condition: { type: "RARITY_OWNED", rarity: "LEGENDARY", n: 5 } },
    { slug: "cadre-raden", kind: "FRAME", label: { fr: "Raden", en: "Raden" }, hint: { fr: "Posséder 3 Mythiques différentes.", en: "Own 3 different Mythics." }, frameStyle: "raden", condition: { type: "RARITY_OWNED", rarity: "MYTHIC", n: 3 } },
    { slug: "cadre-sakura", kind: "FRAME", label: { fr: "Sakura", en: "Sakura" }, hint: { fr: "Compléter une série.", en: "Complete a series." }, frameStyle: "sakura", condition: { type: "SERIES_COMPLETED_COUNT", n: 1 } },
    { slug: "cadre-kintsugi", kind: "FRAME", label: { fr: "Kintsugi", en: "Kintsugi" }, hint: { fr: "Compléter 10 séries.", en: "Complete 10 series." }, frameStyle: "kintsugi", condition: { type: "SERIES_COMPLETED_COUNT", n: 10 } },
  ];
  const current = await prisma.cosmetic.findMany({ select: { slug: true, kind: true, sortOrder: true } });
  const existing = new Set(current.map((c) => c.slug));
  const missing = seeds.filter((s) => !existing.has(s.slug));
  // Les nouveaux se rangent après ceux déjà en base, sans bousculer l'ordre réglé dans l'admin
  const next = { TITLE: 0, FRAME: 0 };
  for (const c of current) next[c.kind] = Math.max(next[c.kind], c.sortOrder);
  await prisma.cosmetic.createMany({
    data: missing.map((s) => ({ slug: s.slug, kind: s.kind, label: s.label, hint: s.hint, frameStyle: s.frameStyle ?? null, condition: s.condition, sortOrder: (next[s.kind] += 10) })),
  });
  console.log(`Cosmétiques : ${missing.length} créés${absent.length ? ` (séries absentes : ${absent.join(", ")})` : ""}.`);
} finally {
  await prisma.$disconnect();
}
