// Sachets de test pour le compte invité du navigateur de vérification ; supprimé après usage.
import { config } from "dotenv";
import { PrismaClient } from "./generated/prisma/client.ts";
import { createPgAdapter } from "./server/pg-adapter.ts";

config({ path: [".env.local", ".env"], quiet: true });
const prisma = new PrismaClient({ adapter: createPgAdapter(process.env.DATABASE_URL!) });
const ownerId = "cmvp55dev0000387kcojzcc82";
const mode = process.argv[2];
try {
  if (mode === "add") {
    const types = await prisma.boosterType.findMany({ where: { slug: { in: ["divin", "apocalypse"] } }, select: { id: true, slug: true } });
    for (const t of types) {
      const row = await prisma.sealedDrop.create({ data: { id: `verif-${t.slug}`, ownerId, boosterTypeId: t.id, source: "DRAW", giftable: true }, select: { id: true } });
      console.log(t.slug, row.id);
    }
  } else if (mode === "show") {
    const drops = await prisma.sealedDrop.findMany({ where: { ownerId }, select: { id: true, openedAt: true, openingId: true } });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: ownerId }, select: { apocalypseKarma: true, pityCount: true } });
    const openings = await prisma.boosterOpening.findMany({ where: { userId: ownerId, sealedDropId: { not: null } }, select: { id: true, boosterSlug: true, divine: true, apocalypse: true } });
    console.log(JSON.stringify({ drops, user, openings }, null, 1));
  }
} finally {
  await prisma.$disconnect();
}
