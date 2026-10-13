import "server-only";
import type { Adapter, AdapterAccount, AdapterSession, AdapterUser } from "next-auth/adapters";
import type { User } from "@/generated/prisma/client";
import { prisma } from "./db";
import { availableUsername, createPlayer, startingValues } from "./players";

// Adaptateur Auth.js écrit à la main : chaque champ écrit en base est choisi
// explicitement (jamais l'objet reçu tel quel) et la création d'un joueur
// passe par createPlayer (valeurs de départ + journal de Zeni).

function toAdapterUser(u: User): AdapterUser {
  return {
    id: u.id,
    name: u.username,
    email: u.email ?? "",
    emailVerified: u.emailVerified,
    image: u.image,
  };
}

export function kirakuAdapter(): Adapter {
  return {
    // Connexion Discord sans session invitée et sans compte existant
    async createUser(user) {
      const start = await startingValues();
      const created = await prisma.$transaction(async (tx) => {
        const emailTaken = user.email
          ? await tx.user.findUnique({ where: { email: user.email }, select: { id: true } })
          : null;
        return createPlayer(
          tx,
          {
            username: await availableUsername(tx, user.name ?? null),
            isGuest: false,
            email: emailTaken ? null : user.email || null,
            image: user.image ?? null,
          },
          start,
        );
      });
      return toAdapterUser(created);
    },

    async getUser(id) {
      const u = await prisma.user.findUnique({ where: { id } });
      return u ? toAdapterUser(u) : null;
    },

    async getUserByEmail(email) {
      const u = await prisma.user.findUnique({ where: { email } });
      return u ? toAdapterUser(u) : null;
    },

    async getUserByAccount({ provider, providerAccountId }) {
      const account = await prisma.account.findUnique({
        where: { provider_providerAccountId: { provider, providerAccountId } },
        select: { user: true },
      });
      return account ? toAdapterUser(account.user) : null;
    },

    async updateUser(user) {
      const u = await prisma.user.update({
        where: { id: user.id },
        data: {
          ...(user.emailVerified !== undefined && { emailVerified: user.emailVerified }),
          ...(user.image !== undefined && { image: user.image }),
        },
      });
      return toAdapterUser(u);
    },

    async linkAccount(account: AdapterAccount) {
      await prisma.account.create({
        data: {
          userId: account.userId,
          type: account.type,
          provider: account.provider,
          providerAccountId: account.providerAccountId,
          refresh_token: account.refresh_token ?? null,
          access_token: account.access_token ?? null,
          expires_at: account.expires_at ?? null,
          token_type: account.token_type ?? null,
          scope: account.scope ?? null,
          id_token: account.id_token ?? null,
          session_state: typeof account.session_state === "string" ? account.session_state : null,
        },
      });
    },

    async createSession({ sessionToken, userId, expires }) {
      const s = await prisma.session.create({ data: { sessionToken, userId, expires } });
      return { sessionToken: s.sessionToken, userId: s.userId, expires: s.expires };
    },

    async getSessionAndUser(sessionToken) {
      const s = await prisma.session.findUnique({ where: { sessionToken }, include: { user: true } });
      if (!s) return null;
      const session: AdapterSession = {
        sessionToken: s.sessionToken,
        userId: s.userId,
        expires: s.expires,
      };
      return { session, user: toAdapterUser(s.user) };
    },

    async updateSession({ sessionToken, expires }) {
      if (!expires) return null;
      const s = await prisma.session.update({ where: { sessionToken }, data: { expires } });
      return { sessionToken: s.sessionToken, userId: s.userId, expires: s.expires };
    },

    async deleteSession(sessionToken) {
      await prisma.session.deleteMany({ where: { sessionToken } });
    },
  };
}
