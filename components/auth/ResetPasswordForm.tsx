"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { initialFormState } from "@/lib/auth/form-state";
import { PASSWORD_MAX, PASSWORD_MIN } from "@/lib/auth/schemas";
import { resetPassword } from "@/server/actions/account";
import { Button } from "../ui/Button";
import { Field } from "./Field";
import { FormAlert } from "./FormAlert";

export function ResetPasswordForm({ token }: { token: string }) {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState(resetPassword, initialFormState);

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="token" value={token} />
      <FormAlert error={state.error} />
      <Field
        name="password"
        type="password"
        label={t("reset.password")}
        hint={t("register.passwordHint")}
        error={state.fields?.password}
        autoComplete="new-password"
        minLength={PASSWORD_MIN}
        maxLength={PASSWORD_MAX}
        required
      />
      <Field
        name="passwordConfirm"
        type="password"
        label={t("reset.passwordConfirm")}
        error={state.fields?.passwordConfirm}
        autoComplete="new-password"
        maxLength={PASSWORD_MAX}
        required
      />
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? t("pending") : t("reset.submit")}
      </Button>
    </form>
  );
}
