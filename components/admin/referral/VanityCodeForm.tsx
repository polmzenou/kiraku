"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from "react";
import { clearVanityCodeAction, setVanityCodeAction, vanityStatusAction } from "@/server/actions/admin-referral";
import { Button } from "../../ui/Button";
import { inputClass } from "../../ui/Field";
import { FormMessage } from "../fields";

type Status = "FREE" | "TAKEN" | "FORMAT" | "STANDARD_SHAPE";
const DEBOUNCE_MS = 300;

const PILL: Record<Status, string> = {
  FREE: "border-hisui/60 text-hisui",
  TAKEN: "border-shu/60 text-shu",
  FORMAT: "border-border text-text-muted",
  STANDARD_SHAPE: "border-shu/60 text-shu",
};

/**
 * Pose d'un code perso par l'équipe (ADMIN et DEV) : le pseudo du joueur et le code (4 à 16 lettres ou chiffres),
 * avec l'indication « Libre » ou « Déjà pris » pendant la saisie. Le serveur revérifie tout sous verrou.
 */
export function VanityCodeForm() {
  const t = useTranslations("admin.referralV2.codes");
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<Status | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const request = useRef(0);
  const userId = useId();
  const codeId = useId();

  useEffect(() => () => clearTimeout(timer.current), []);

  const check = (name: string, value: string) => {
    clearTimeout(timer.current);
    if (!value.trim()) return setStatus(null);
    timer.current = setTimeout(() => {
      const id = ++request.current;
      void vanityStatusAction({ username: name.trim(), code: value.trim() }).then((res) => {
        if (id === request.current) setStatus(res.ok ? res.status : null);
      });
    }, DEBOUNCE_MS);
  };

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const res = await setVanityCodeAction({ username: username.trim(), code: code.trim() });
      if (!res.ok) return setMessage({ tone: "error", text: t(`errors.${res.error}`) });
      setMessage({ tone: "ok", text: t("done", { code: res.code, name: username.trim() }) });
      setUsername("");
      setCode("");
      setStatus(null);
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={userId} className="text-sm font-bold">
            {t("player")}
          </label>
          <input
            id={userId}
            value={username}
            maxLength={40}
            autoComplete="off"
            required
            onChange={(e) => {
              setUsername(e.currentTarget.value);
              check(e.currentTarget.value, code);
            }}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={codeId} className="text-sm font-bold">
            {t("code")}
          </label>
          <div className="relative">
            <input
              id={codeId}
              value={code}
              maxLength={40}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              required
              aria-describedby={status ? `${codeId}-status` : undefined}
              onChange={(e) => {
                const value = e.currentTarget.value.toUpperCase();
                setCode(value);
                check(username, value);
              }}
              className={`${inputClass} w-full pr-28 font-title tracking-[0.18em] uppercase`}
            />
            {status && (
              <span
                id={`${codeId}-status`}
                aria-live="polite"
                className={`absolute top-1/2 right-2 -translate-y-1/2 rounded-pill border px-2.5 py-0.5 text-xs font-bold ${PILL[status]}`}
              >
                {t(`status.${status}`)}
              </span>
            )}
          </div>
        </div>
      </div>
      <p className="text-xs text-text-muted">{t("hint")}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" size="sm" disabled={pending || status === "TAKEN" || status === "FORMAT" || status === "STANDARD_SHAPE"}>
          {t("submit")}
        </Button>
        <FormMessage message={message} />
      </div>
    </form>
  );
}

/** Retire le code perso d'un joueur (son code standard reste), après une confirmation d'un clic. */
export function VanityClearButton({ userId, name, code }: { userId: string; name: string; code: string }) {
  const t = useTranslations("admin.referralV2.codes");
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!confirm) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirm(true)}>
        {t("clear")}
      </Button>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="text-xs font-bold">{t("confirmClear", { code, name })}</span>
      <Button
        type="button"
        variant="danger"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await clearVanityCodeAction({ userId });
            if (!res.ok) setError(t(`errors.${res.error}`));
          })
        }
      >
        {t("confirm")}
      </Button>
      <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setConfirm(false)}>
        {t("cancel")}
      </Button>
      {error && (
        <span role="alert" className="text-xs text-shu">
          {error}
        </span>
      )}
    </span>
  );
}
