import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    // Conservé le temps du retour OAuth pour l'annonce ; ni stocké en base ni exposé en session.
    discordUsername?: string;
  }

  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}
