"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Link } from "@/i18n/navigation";
import { initialFormState } from "@/lib/auth/form-state";
import { PASSWORD_MAX } from "@/lib/auth/schemas";
import { login } from "@/server/actions/account";
import { Button } from "../ui/Button";
import { Field } from "./Field";
import { FormAlert } from "./FormAlert";
import { PasswordField } from "./PasswordField";

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
        inputMode="email"
        label={t("login.email")}
        error={state.fields?.email}
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={254}
        required
      />
      <div className="flex flex-col gap-1">
        <PasswordField
          name="password"
          label={t("login.password")}
          error={state.fields?.password}
          autoComplete="current-password"
          maxLength={PASSWORD_MAX}
          required
        />
        <Link
          href="/connexion/mot-de-passe-oublie"
          className="inline-flex min-h-11 w-fit items-center self-end text-sm text-link underline underline-offset-4"
        >
          {t("login.forgot")}
        </Link>
      </div>
      <Button type="submit" variant="shu" disabled={pending} className="min-h-12 text-base">
        {pending ? t("pending") : t("login.submit")}
      </Button>
    </form>
  );
}
