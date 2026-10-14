import "server-only";
import { randomBytes } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { guestUsername, sanitizeUsername } from "@/lib/username";
import { credit } from "./economy/ledger";
import { getSetting } from "./settings";

type Tx = Prisma.TransactionClient;

/** Pseudo libre dérivé de `base`, avec un suffixe aléatoire si déjà pris. */
export async function availableUsername(tx: Tx, base: string | null): Promise<string> {
  const clean = sanitizeUsername(base);
  if (clean && !(await tx.user.findUnique({ where: { username: clean }, select: { id: true } }))) {
    return clean;
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = clean
      ? `${clean.slice(0, 13)}-${randomBytes(3).toString("hex").toUpperCase()}`
      : guestUsername(randomBytes(3));
    if (!(await tx.user.findUnique({ where: { username: candidate }, select: { id: true } }))) {
      return candidate;
    }
  }
  throw new Error("USERNAME_UNAVAILABLE");
}

export async function startingValues() {
  const [zeni, boosters] = await Promise.all([
    getSetting("economy.startingZeni"),
    getSetting("booster.maxStock"),
  ]);
  return { zeni, boosters };
}

type NewPlayer = {
  username: string;
  isGuest: boolean;
  email?: string | null;
  image?: string | null;
  passwordHash?: string | null;
};

/** Visibilité par défaut : un invité est privé, un compte inscrit est public. */
export function defaultVisibility(isGuest: boolean) {
  return isGuest ? ("PRIVATE" as const) : ("PUBLIC" as const);
}

/** Un invité devient un compte : profil public, sauf s'il a déjà choisi sa confidentialité. */
export async function publishProfileOnSignup(tx: Tx, userId: string) {
  await tx.user.updateMany({
    where: { id: userId, privacyChosenAt: null },
    data: { profileVisibility: defaultVisibility(false) },
  });
}

/**
 * Crée un joueur avec ses valeurs de départ (lues dans GameSetting) et la ligne
 * CoinTransaction SIGNUP qui justifie son solde. À appeler dans une transaction.
 */
export async function createPlayer(
  tx: Tx,
  player: NewPlayer,
  start: Awaited<ReturnType<typeof startingValues>>,
) {
  const user = await tx.user.create({
    data: {
      username: player.username,
      isGuest: player.isGuest,
      email: player.email ?? null,
      image: player.image ?? null,
      passwordHash: player.passwordHash ?? null,
      profileVisibility: defaultVisibility(player.isGuest),
      boosterStock: start.boosters,
    },
  });
  if (start.zeni > 0) {
    // Le solde de départ passe par le journal comme tout autre mouvement
    const coins = await credit(tx, { userId: user.id, amount: start.zeni, reason: "SIGNUP" });
    return { ...user, coins };
  }
  return user;
}
