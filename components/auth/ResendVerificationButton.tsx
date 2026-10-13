"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { initialFormState } from "@/lib/auth/form-state";
import { resendVerification } from "@/server/actions/account";
import { Button } from "../ui/Button";
import { FormAlert } from "./FormAlert";
import { MailNotSent } from "./MailNotSent";

export function ResendVerificationButton() {
  const t = useTranslations();
  const [state, action, pending] = useActionState(resendVerification, initialFormState);

  if (state.done && state.mailNotSent) return <MailNotSent />;
  if (state.done) return <p role="status" className="text-sm">{t("account.verificationSent")}</p>;

  return (
    <form action={action} className="flex flex-col gap-2">
      <FormAlert error={state.error} />
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? t("auth.pending") : t("account.resendVerification")}
      </Button>
    </form>
  );
}
