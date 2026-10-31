"use client";

import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { USERNAME_REGEX } from "@/lib/username";
import { sendFriendRequestAction } from "@/server/actions/social";
import { Button } from "../ui/Button";

/**
 * Ajout par pseudo exact, sans suggestion (la recherche partielle, limitée aux profils visibles, est
 * sur la page Social). La réponse est la même qu'une demande normale quand la cible ne peut rien
 * recevoir : seuls « introuvable » et « déjà en cours » diffèrent.
 */
export function AddFriendForm() {
  const t = useTranslations("friends");
  const id = useId();
  const [value, setValue] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const username = value.trim();
  const valid = USERNAME_REGEX.test(username);

  const submit = () =>
    startTransition(async () => {
      try {
        const res = await sendFriendRequestAction({ username });
        if (!res.ok) {
          setMessage({ tone: "error", text: t(`errors.${res.error}`) });
          return;
        }
        setValue("");
        setMessage({
          tone: "ok",
          text:
            res.status === "ACCEPTED"
              ? t("nowFriends", { name: username })
              : res.status === "ALREADY"
                ? t("already", { name: username })
                : t("requestSentTo", { name: username }),
        });
      } catch {
        setMessage({ tone: "error", text: t("errors.UNAVAILABLE") });
      }
    });

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid && !pending) submit();
      }}
    >
      <label htmlFor={id} className="text-sm font-bold">
        {t("addLabel")}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          name="username"
          value={value}
          onChange={(e) => {
            setValue(e.currentTarget.value);
            setMessage(null);
          }}
          maxLength={20}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder={t("addPlaceholder")}
          className="min-h-11 min-w-0 flex-1 rounded-control border border-border bg-surface px-3 text-text placeholder:text-text-muted"
        />
        <Button type="submit" variant="primary" disabled={!valid || pending}>
          {pending ? t("pending") : t("add")}
        </Button>
      </div>
      <p className="text-xs text-text-muted">{t("addHint")}</p>
      {message && (
        <p role="status" className={`text-sm ${message.tone === "ok" ? "text-text" : "text-shu"}`}>
          {message.text}
        </p>
      )}
    </form>
  );
}
