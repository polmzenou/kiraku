import { getTranslations } from "next-intl/server";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/Button";
import { Link } from "@/i18n/navigation";
import { abandonGuestAndSignIn } from "@/server/actions/auth";
import { getCurrentUser } from "@/server/user";

// Erreurs renvoyées par Auth.js (Discord). OAuthAccountNotLinked a deux causes :
// - connecté (invité) : ce Discord appartient déjà à un autre joueur ;
// - sans session : un compte e-mail utilise déjà l'adresse de ce Discord.
export default async function AuthErrorPage({ searchParams }: PageProps<"/[locale]/connexion/erreur">) {
  const { error } = await searchParams;
  const [t, user] = await Promise.all([getTranslations("authError"), getCurrentUser()]);
  const notLinked = error === "OAuthAccountNotLinked";
  const alreadyLinked = notLinked && user?.isGuest;
  const emailExists = notLinked && !user;

  const title = alreadyLinked ? t("alreadyLinkedTitle") : emailExists ? t("emailExistsTitle") : t("title");
  const body = alreadyLinked ? t("alreadyLinkedBody") : emailExists ? t("emailExistsBody") : t("generic");

  return (
    <PageShell>
      <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
        <h1 className="text-xl font-bold">{title}</h1>
        <p className="text-text-muted">{body}</p>
        {alreadyLinked && (
          <form action={abandonGuestAndSignIn}>
            <Button type="submit" variant="shu" className="w-full">
              {t("continue")}
            </Button>
          </form>
        )}
        <Link
          href={emailExists ? "/connexion" : "/"}
          className="inline-flex min-h-11 items-center text-link underline underline-offset-4"
        >
          {t("back")}
        </Link>
      </section>
    </PageShell>
  );
}
