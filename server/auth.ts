import "server-only";
import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";
import { after } from "next/server";
import { GUEST_PREFIX } from "@/lib/username";
import { safeRedirect } from "@/lib/safe-redirect";
import { kirakuAdapter } from "./auth-adapter";
import { prisma } from "./db";
import { credit } from "./economy/ledger";
import { attachFromCookie } from "./economy/referral";
import { discordEnabled, discordLinkConfigured, env } from "./env";
import { notifyDiscordLink } from "./discord/link-notification";
import { queueLinkedDiscordRole, syncLinkedDiscordRole } from "./discord/roles";
import { linkedRoleConfigured } from "./discord/roles-config";
import { availableUsername, publishProfileOnSignup } from "./players";
import { SESSION_COOKIE, SESSION_MAX_AGE } from "./session";
import { getSetting } from "./settings";
import { writeAdminLog } from "./admin/log";

// Garde le calcul d'avatar et du nom d'affichage fourni par Auth.js.
const defaultDiscordProfile = Discord({}).profile!;

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
    ? [
        Discord({
          clientId: env.AUTH_DISCORD_ID,
          clientSecret: env.AUTH_DISCORD_SECRET,
          // Discord renvoie désormais « iss » dans la réponse d'autorisation (RFC 9207) ; sans
          // émetteur déclaré, Auth.js attend « https://authjs.dev » et refuse le retour.
          issuer: "https://discord.com",
          profile: async (profile, tokens) => ({
            ...(await defaultDiscordProfile(profile, tokens)),
            discordUsername: profile.username,
          }),
        }),
      ]
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

      const firstLink = await prisma.$transaction(async (tx) => {
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

        await publishProfileOnSignup(tx, userId);

        // Bonus de première liaison : une seule fois par compte, même après déliaison
        const first = await tx.user.updateMany({
          where: { id: userId, discordLinkedAt: null },
          data: { discordLinkedAt: new Date() },
        });
        if (first.count === 1 && bonus > 0) {
          await credit(tx, { userId, amount: bonus, reason: "DISCORD_LINK" });
        }

        // Premier administrateur : désigné par son id Discord dans l'environnement
        if (env.ADMIN_DISCORD_ID && account.providerAccountId === env.ADMIN_DISCORD_ID) {
          const granted = await tx.user.updateMany({ where: { id: userId, role: "USER" }, data: { role: "ADMIN" } });
          if (granted.count === 1) {
            await writeAdminLog(tx, {
              adminId: userId,
              action: "ROLE_GRANT",
              targetType: "User",
              targetId: userId,
              before: "USER",
              after: "ADMIN",
            });
          }
        }
        return first.count === 1;
      });

      // Après validation de la transaction et envoi de la réponse : Discord ne ralentit pas
      // la connexion. Les reconnexions et les nouvelles liaisons du même joueur n'annoncent rien.
      if (firstLink && discordLinkConfigured) {
        after(async () => {
          await notifyDiscordLink({
            discordId: account.providerAccountId,
            username: profile.discordUsername,
            displayName: profile.name,
          });
        });
      }
      if (linkedRoleConfigured()) {
        after(async () => {
          try {
            await queueLinkedDiscordRole(account.providerAccountId);
            await syncLinkedDiscordRole(account.providerAccountId);
          } catch { console.warn("[discord] synchronisation du compte lié reportée au cron."); }
        });
      }

      // Lien d'invitation suivi avant l'inscription : rattaché après la liaison, sans la bloquer
      await attachFromCookie(userId);
    },
  },
});
