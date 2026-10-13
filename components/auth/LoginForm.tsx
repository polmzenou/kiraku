"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { initialFormState } from "@/lib/auth/form-state";
import { PASSWORD_MAX } from "@/lib/auth/schemas";
import { login } from "@/server/actions/account";
import { Button } from "../ui/Button";
import { Field } from "./Field";
import { FormAlert } from "./FormAlert";

export function LoginForm() {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState(login, initialFormState);

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormAlert error={state.error} />
      <Field
        name="email"
        defaultValue={state.values?.email}
        type="email"
        label={t("login.email")}
        error={state.fields?.email}
        autoComplete="email"
        maxLength={254}
        required
      />
      <Field
        name="password"
        type="password"
        label={t("login.password")}
        error={state.fields?.password}
        autoComplete="current-password"
        maxLength={PASSWORD_MAX}
        required
      />
      <Button type="submit" variant="shu" disabled={pending}>
        {pending ? t("pending") : t("login.submit")}
      </Button>
    </form>
  );
}
