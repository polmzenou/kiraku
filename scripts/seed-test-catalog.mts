// Catalogue synthétique d'une base de test VIDE (job « Tests sur base » de la CI). Les tests *.db.test.ts lisent des
// cartes publiées et classées de chaque rareté, que seul l'import AniList (réseau) remplit ailleurs. Usage :
//   DATABASE_URL_TEST="postgresql://…" npx tsx scripts/seed-test-catalog.mts
// Garde-fous : ne lit que DATABASE_URL_TEST (jamais .env ni DATABASE_URL), et n'écrit rien dès que la base a une
// carte : sans effet sur une copie de la prod ou sur une base de test déjà remplie.
import { PrismaClient } from "../generated/prisma/client.ts";
import { createPgAdapter } from "../server/pg-adapter.ts";

const url = process.env.DATABASE_URL_TEST;
if (!url) throw new Error("DATABASE_URL_TEST manquante : ce script ne remplit qu'une base de test isolée");

// Du plus rare (rang 1) au plus commun, comme le classement par popularité de l'import.
const COUNTS: [rarity: string, count: number][] = [
  ["MYTHIC", 6],
  ["LEGENDARY", 12],
  ["EPIC", 24],
  ["RARE", 48],
  ["UNCOMMON", 90],
  ["COMMON", 180],
];

const prisma = new PrismaClient({ adapter: createPgAdapter(url) });
try {
  if ((await prisma.card.count()) > 0) {
    console.log("Catalogue déjà présent : rien à faire.");
  } else {
    const series = await prisma.series.create({ data: { type: "ANIME", titleRomaji: "Kiraku CI" } });
    const rows = COUNTS.flatMap(([rarity, count]) => Array.from({ length: count }, () => rarity)).map((rarity, i) => {
      const rank = i + 1;
      const name = `CI ${rarity} ${rank}`;
      // origin ANILIST par défaut : le trigger catalog_sync_card_identity publie une carte qui a un rang
      return {
        name,
        imageUrl: `https://example.test/ci/${rank}.png`,
        favorites: 10_000 - rank,
        rank,
        rarity,
        power: Math.max(10, 200 - rank),
        ki: Math.max(10, 150 - Math.floor(rank / 2)),
        seriesId: series.id,
        searchText: name.toLowerCase(),
      };
    });
    await prisma.card.createMany({ data: rows });
    // Une variante XR (création manuelle, sans rang) pour le booster garanti
    const base = await prisma.card.findUniqueOrThrow({ where: { rank: 1 }, select: { id: true } });
    await prisma.card.create({
      data: {
        name: "CI XR",
        imageUrl: "https://example.test/ci/xr.png",
        favorites: 0,
        origin: "CUSTOM",
        status: "PUBLISHED",
        rarity: "XR",
        power: 200,
        ki: 150,
        seriesId: series.id,
        searchText: "ci xr",
        variantOfId: base.id,
        formName: "XR",
      },
    });
    console.log(`Catalogue de test : ${rows.length + 1} cartes créées.`);
  }
} finally {
  await prisma.$disconnect();
}
