// Donne le rôle ADMIN à un joueur, pour le développement sans Discord. Usage :
//   npm run admin:grant -- <pseudo>
//   npx tsx scripts/grant-admin.mts <pseudo>        (sous PowerShell, si le « -- » est avalé)
//   npx tsx scripts/grant-admin.mts <pseudo> --revoke
// En production, le premier admin est désigné par ADMIN_DISCORD_ID (liaison Discord).
import { parseArgs } from "node:util";
import { config } from "dotenv";
import { PrismaClient } from "../generated/prisma/client.ts";
import { createPgAdapter } from "../server/pg-adapter.ts";

config({ path: [".env.local", ".env"], quiet: true });

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { revoke: { type: "boolean", default: false } },
});
const username = positionals[0];
if (!username || !/^[A-Za-z0-9_-]{3,20}$/.test(username)) {
  console.error("Usage : npx tsx scripts/grant-admin.mts <pseudo> [--revoke]");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL manquante (.env.local ou .env).");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: createPgAdapter(process.env.DATABASE_URL) });
const [from, to] = values.revoke ? (["ADMIN", "USER"] as const) : (["USER", "ADMIN"] as const);

try {
  const done = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { username }, select: { id: true, role: true } });
    if (!user) return "introuvable";
    const updated = await tx.user.updateMany({ where: { id: user.id, role: from }, data: { role: to } });
    if (updated.count === 0) return `déjà ${user.role}`;
    await tx.adminLog.create({
      data: {
        adminId: user.id,
        action: values.revoke ? "ROLE_REVOKE" : "ROLE_GRANT",
        targetType: "User",
        targetId: user.id,
        before: from,
        after: to,
      },
    });
    return to;
  });
  console.log(`${username} : ${done}`);
} finally {
  await prisma.$disconnect();
}
