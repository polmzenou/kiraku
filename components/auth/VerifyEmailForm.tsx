"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Link } from "@/i18n/navigation";
import { initialFormState } from "@/lib/auth/form-state";
import { verifyEmail } from "@/server/actions/account";
import { Button } from "../ui/Button";
import { FormAlert } from "./FormAlert";

// Confirmation par un bouton plutôt qu'à l'ouverture du lien : les scanners de
// liens des messageries ne consomment pas le jeton à la place du joueur.
export function VerifyEmailForm({ token }: { token: string }) {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState(verifyEmail, initialFormState);

  if (state.done) {
    return (
      <div className="flex flex-col gap-3">
        <p role="status">{t("verify.done")}</p>
        <Link href="/" className="inline-flex min-h-11 items-center text-link underline underline-offset-4">
          {t("verify.continue")}
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <FormAlert error={state.error} />
      <Button type="submit" variant="shu" disabled={pending}>
        {pending ? t("pending") : t("verify.submit")}
      </Button>
    </form>
  );
}
