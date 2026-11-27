"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";
import { adminSendTestMailAction, type MailTestResult } from "@/server/actions/admin-mail";
import { Button } from "../ui/Button";
import { Field, inputClass } from "./fields";

/** Envoie un e-mail de test à l'adresse choisie et affiche la raison exacte d'un échec. */
export function MailTestForm({ defaultTo }: { defaultTo: string }) {
  const t = useTranslations("admin.mail");
  const [to, setTo] = useState(defaultTo);
  const [result, setResult] = useState<MailTestResult | null>(null);
  const [pending, startTransition] = useTransition();

  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      setResult(await adminSendTestMailAction({ to }).catch((): MailTestResult => ({ ok: false, error: "MAIL", reason: "error" })));
    });
  }

  return (
    <form onSubmit={send} className="flex flex-col gap-3">
      <Field label={t("testTo")}>
        {(id) => (
          <input id={id} type="email" required maxLength={254} autoComplete="off" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
        )}
      </Field>
      <Button type="submit" disabled={pending || !to} className="w-fit">
        {pending ? t("sending") : t("send")}
      </Button>
      {result && (
        <p role="status" className={`text-sm ${result.ok ? "text-hisui" : "text-shu"}`}>
          {result.ok ? t("sent") : result.error === "MAIL" ? t(`reasons.${result.reason}`) : t(`errors.${result.error}`)}
          {!result.ok && result.error === "MAIL" && result.detail && <span className="mt-1 block break-words text-text-muted">{result.detail}</span>}
        </p>
      )}
    </form>
  );
}
