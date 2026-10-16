"use client";

import { useTranslations } from "next-intl";
import { useId, useState, useTransition, type ReactNode } from "react";
import { Button, type ButtonVariant } from "../ui/Button";
import { Sheet } from "../ui/Sheet";
import { inputClass } from "./fields";

/**
 * Bouton d'une action admin irréversible : ouvre une feuille qui décrit l'effet, demande au besoin
 * de retaper un mot (pseudo, slug…), puis lance `onConfirm`. Celle-ci rend un message d'erreur
 * déjà traduit, ou null si tout s'est bien passé (la feuille se ferme).
 */
export function ConfirmAction({
  label,
  title,
  description,
  confirmLabel,
  typeToConfirm,
  variant = "shu",
  onConfirm,
  children,
}: {
  label: string;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  /** Texte à retaper à l'identique (casse ignorée) pour activer la confirmation. */
  typeToConfirm?: string;
  variant?: ButtonVariant;
  /** Reçoit le texte retapé (vide sans `typeToConfirm`) : le serveur le revérifie. */
  onConfirm: (typed: string) => Promise<string | null>;
  children?: ReactNode;
}) {
  const t = useTranslations("admin.confirm");
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const matches = !typeToConfirm || typed.trim().toLowerCase() === typeToConfirm.toLowerCase();

  return (
    <>
      <Button type="button" variant={variant} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Sheet
        open={open}
        onClose={() => {
          setOpen(false);
          setTyped("");
          setError(null);
        }}
        title={title}
      >
        <div className="flex flex-col gap-3 text-sm">{description}</div>
        {children}
        {typeToConfirm && (
          <div className="flex flex-col gap-1">
            <label htmlFor={inputId} className="text-sm">
              {t("typeToConfirm", { value: typeToConfirm })}
            </label>
            <input
              id={inputId}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={60}
              className={inputClass}
            />
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-shu">
            {error}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" onClick={() => setOpen(false)}>
            {t("cancel")}
          </Button>
          <Button
            type="button"
            variant="shu"
            disabled={!matches || pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const message = await onConfirm(typed.trim()).catch(() => t("unexpected"));
                if (message) setError(message);
                else {
                  setOpen(false);
                  setTyped("");
                }
              })
            }
          >
            {pending ? t("pending") : confirmLabel}
          </Button>
        </div>
      </Sheet>
    </>
  );
}
