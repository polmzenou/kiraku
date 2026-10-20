"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Link } from "@/i18n/navigation";
import { initialFormState } from "@/lib/auth/form-state";
import { PASSWORD_MAX, PASSWORD_MIN } from "@/lib/auth/schemas";
import { register } from "@/server/actions/account";
import { Button } from "../ui/Button";
import { Field } from "./Field";
import { FormAlert } from "./FormAlert";
import { PasswordField } from "./PasswordField";

/**
 * Inscription e-mail + mot de passe. `formToken` (signé par la page) et le champ piège `website`
 * écartent les robots ; tout est revalidé par le serveur (server/actions/account.ts).
 */
export function RegisterForm({ formToken, honeypot }: { formToken: string; honeypot: string }) {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState(register, initialFormState);
  // Pseudo et e-mail suivis pour la jauge : un mot de passe qui les contient est refusé
  const [username, setUsername] = useState(state.values?.username ?? "");
  const [email, setEmail] = useState(state.values?.email ?? "");

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormAlert error={state.error} />
      <input type="hidden" name="formToken" value={formToken} />
      {/* Piège : invisible et hors du parcours clavier, seul un robot le remplit */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          {honeypot}
          <input type="text" name={honeypot} tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>
      <Field
        name="username"
        defaultValue={state.values?.username}
        onChange={(e) => setUsername(e.target.value)}
        label={t("register.username")}
        hint={t("register.usernameHint")}
        error={state.fields?.username}
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        minLength={3}
        maxLength={20}
        required
      />
      <Field
        name="email"
        defaultValue={state.values?.email}
        onChange={(e) => setEmail(e.target.value)}
        type="email"
        inputMode="email"
        label={t("register.email")}
        error={state.fields?.email}
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={254}
        required
      />
      <PasswordField
        name="password"
        label={t("register.password")}
        hint={t("register.passwordHint")}
        error={state.fields?.password}
        autoComplete="new-password"
        minLength={PASSWORD_MIN}
        maxLength={PASSWORD_MAX}
        meter={{ username, email, minLength: PASSWORD_MIN }}
        required
      />
      <PasswordField
        name="passwordConfirm"
        label={t("register.passwordConfirm")}
        error={state.fields?.passwordConfirm}
        autoComplete="new-password"
        maxLength={PASSWORD_MAX}
        required
      />
      <div className="flex flex-col gap-1">
        <label className="flex min-h-11 items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="terms"
            required
            aria-invalid={state.fields?.terms ? true : undefined}
            aria-describedby={state.fields?.terms ? "terms-error" : undefined}
            className="mt-0.5 choice shrink-0 "
          />
          <span>
            {t.rich("register.terms", {
              terms: (chunks) => (
                <Link href="/cgu" target="_blank" className="font-medium text-ai underline underline-offset-4">
                  {chunks}
                </Link>
              ),
              privacy: (chunks) => (
                <Link href="/confidentialite" target="_blank" className="font-medium text-ai underline underline-offset-4">
                  {chunks}
                </Link>
              ),
            })}
          </span>
        </label>
        {state.fields?.terms && (
          <p id="terms-error" className="text-sm text-shu">
            {t(`fieldErrors.${state.fields.terms}`)}
          </p>
        )}
      </div>
      <Button type="submit" variant="primary" disabled={pending} className="mt-2 min-h-12 text-base">
        {pending ? t("pending") : t("register.submit")}
      </Button>
    </form>
  );
}
