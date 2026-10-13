import "server-only";
import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";
import { GUEST_PREFIX } from "@/lib/username";
import { safeRedirect } from "@/lib/safe-redirect";
import { kirakuAdapter } from "./auth-adapter";
import { prisma } from "./db";
import { discordEnabled, env } from "./env";
import { availableUsername } from "./players";
import { SESSION_COOKIE, SESSION_MAX_AGE } from "./session";
import { getSetting } from "./settings";

// Auth.js gère les sessions en base et, quand il est configuré, Discord.
// Les comptes invités et e-mail + mot de passe ouvrent leurs sessions eux-mêmes
// (server/session.ts) dans la même table et le même cookie.
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: kirakuAdapter(),
  secret: env.AUTH_SECRET,
  trustHost: true,
  session: { strategy: "database", maxAge: SESSION_MAX_AGE, updateAge: 24 * 60 * 60 },
  cookies: { sessionToken: SESSION_COOKIE },
  providers: discordEnabled
    ? [Discord({ clientId: env.AUTH_DISCORD_ID, clientSecret: env.AUTH_DISCORD_SECRET })]
    : [],
  pages: { error: "/connexion/erreur" },
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
    redirect({ url, baseUrl }) {
      return safeRedirect(url, baseUrl);
    },
  },
  events: {
    // Liaison Discord (depuis un invité ou un compte e-mail) : même User.
    async linkAccount({ user, account, profile }) {
      if (!user.id || account.provider !== "discord") return;
      const userId = user.id;
      const bonus = await getSetting("discord.linkBonusZeni");

      await prisma.$transaction(async (tx) => {
        const current = await tx.user.findUnique({
          where: { id: userId },
          select: { username: true, email: true },
        });
        if (!current) return;
        const email = profile.email ?? null;
        const emailFree =
          email && !current.email
            ? !(await tx.user.findUnique({ where: { email }, select: { id: true } }))
            : false;
        await tx.user.update({
          where: { id: userId },
          data: {
            isGuest: false,
            ...(typeof profile.image === "string" && { image: profile.image }),
            ...(emailFree && { email }),
            ...(current.username.startsWith(GUEST_PREFIX) && {
              username: await availableUsername(tx, typeof profile.name === "string" ? profile.name : null),
            }),
          },
        });

        // Bonus de première liaison : une seule fois par compte, même après déliaison
        const first = await tx.user.updateMany({
          where: { id: userId, discordLinkedAt: null },
          data: { discordLinkedAt: new Date(), coins: { increment: bonus } },
        });
        if (first.count === 1 && bonus > 0) {
          await tx.coinTransaction.create({ data: { userId, amount: bonus, reason: "DISCORD_LINK" } });
        }
      });
    },
  },
});
