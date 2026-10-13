"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { initialFormState } from "@/lib/auth/form-state";
import { PASSWORD_MAX, PASSWORD_MIN } from "@/lib/auth/schemas";
import { register } from "@/server/actions/account";
import { Button } from "../ui/Button";
import { Field } from "./Field";
import { FormAlert } from "./FormAlert";

export function RegisterForm() {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState(register, initialFormState);

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormAlert error={state.error} />
      <Field
        name="username"
        defaultValue={state.values?.username}
        label={t("register.username")}
        hint={t("register.usernameHint")}
        error={state.fields?.username}
        autoComplete="username"
        minLength={3}
        maxLength={20}
        required
      />
      <Field
        name="email"
        defaultValue={state.values?.email}
        type="email"
        label={t("register.email")}
        error={state.fields?.email}
        autoComplete="email"
        maxLength={254}
        required
      />
      <Field
        name="password"
        type="password"
        label={t("register.password")}
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
        label={t("register.passwordConfirm")}
        error={state.fields?.passwordConfirm}
        autoComplete="new-password"
        maxLength={PASSWORD_MAX}
        required
      />
      <Button type="submit" variant="shu" disabled={pending}>
        {pending ? t("pending") : t("register.submit")}
      </Button>
    </form>
  );
}
