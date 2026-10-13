"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { initialFormState } from "@/lib/auth/form-state";
import { requestPasswordReset } from "@/server/actions/account";
import { Button } from "../ui/Button";
import { Field } from "./Field";
import { FormAlert } from "./FormAlert";
import { MailNotSent } from "./MailNotSent";

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState(requestPasswordReset, initialFormState);

  if (state.done && state.mailNotSent) return <MailNotSent />;
  if (state.done) {
    return (
      <p role="status" className="rounded-button border border-border bg-surface-2 px-3 py-2">
        {t("forgot.sent")}
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormAlert error={state.error} />
      <Field
        name="email"
        defaultValue={state.values?.email}
        type="email"
        label={t("forgot.email")}
        error={state.fields?.email}
        autoComplete="email"
        maxLength={254}
        required
      />
      <Button type="submit" variant="shu" disabled={pending}>
        {pending ? t("pending") : t("forgot.submit")}
      </Button>
    </form>
  );
}
