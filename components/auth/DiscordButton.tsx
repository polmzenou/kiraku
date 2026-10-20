import { getTranslations } from "next-intl/server";
import { continueWithDiscord } from "@/server/actions/auth";
import { buttonClasses } from "../ui/Button";

/**
 * « Se connecter / S'inscrire avec Discord », suivi d'un séparateur « ou » avant le formulaire
 * e-mail. Simple formulaire : fonctionne sans JavaScript. Le serveur décide quoi faire de la
 * session invitée selon `intent` (server/actions/auth.ts).
 */
export async function DiscordButton({ intent }: { intent: "login" | "register" }) {
  const t = await getTranslations("auth");
  return (
    <>
      <form action={continueWithDiscord}>
        <input type="hidden" name="intent" value={intent} />
        <button type="submit" className={buttonClasses("secondary", "min-h-12 w-full text-base")}>
          {/* Logo Discord (Clyde), en couleur du texte pour rester dans la DA */}
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="currentColor">
            <path d="M20.32 4.37A19.8 19.8 0 0 0 15.4 2.8a13.7 13.7 0 0 0-.63 1.3 18.4 18.4 0 0 0-5.53 0 13 13 0 0 0-.64-1.3 19.7 19.7 0 0 0-4.92 1.53C.56 9.04-.29 13.6.13 18.1a19.9 19.9 0 0 0 6.03 3.05 14.7 14.7 0 0 0 1.29-2.1 12.9 12.9 0 0 1-2.03-.98c.17-.12.34-.26.5-.39a14.2 14.2 0 0 0 12.16 0c.16.14.33.27.5.39-.65.39-1.33.71-2.04.98.37.74.8 1.44 1.29 2.1a19.8 19.8 0 0 0 6.04-3.05c.5-5.2-.84-9.72-3.55-13.73ZM8.02 15.33c-1.18 0-2.16-1.09-2.16-2.42 0-1.34.96-2.43 2.16-2.43 1.21 0 2.18 1.1 2.16 2.43 0 1.33-.96 2.42-2.16 2.42Zm7.97 0c-1.18 0-2.16-1.09-2.16-2.42 0-1.34.96-2.43 2.16-2.43 1.21 0 2.18 1.1 2.16 2.43 0 1.33-.95 2.42-2.16 2.42Z" />
          </svg>
          {intent === "login" ? t("login.discord") : t("register.discord")}
        </button>
      </form>
      <p className="flex items-center gap-3 text-xs tracking-wide text-text-muted uppercase" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        {t("or")}
        <span className="h-px flex-1 bg-border" />
      </p>
    </>
  );
}
