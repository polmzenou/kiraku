"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { RotatingFamily } from "@/lib/boosters/rotation";
import { setRotationPin } from "@/server/actions/admin-boosters";
import { Button } from "../ui/Button";

type Candidate = { slug: string; name: string; emblem: string };

/**
 * Types mis en avant dans une famille tournante. Enregistrer épingle la sélection jusqu'à la fin
 * de la fenêtre en cours ; « Revenir au hasard » rend la main au tirage.
 */
export function RotationPicker({
  family,
  title,
  candidates,
  selected,
  pinned,
}: {
  family: RotatingFamily;
  title: string;
  candidates: Candidate[];
  selected: string[];
  pinned: boolean;
}) {
  const t = useTranslations("admin");
  const router = useRouter();
  const [draft, setDraft] = useState<string[]>(selected);
  // Nouvelle sélection côté serveur (enregistrement, retour au hasard, nouvelle fenêtre) : on repart d'elle
  const current = `${pinned}:${selected.join(",")}`;
  const [seen, setSeen] = useState(current);
  if (seen !== current) {
    setSeen(current);
    setDraft(selected);
  }
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const changed = draft.length !== selected.length || draft.some((slug) => !selected.includes(slug));

  const send = (slugs: string[] | null) =>
    start(async () => {
      try {
        const res = await setRotationPin({ family, slugs });
        setMessage(
          res.ok
            ? { tone: "ok", text: t(slugs ? "rotation.saved" : "rotation.cleared") }
            : { tone: "error", text: t(`form.errors.${res.error}`, { count: 0 }) },
        );
      } catch {
        setMessage({ tone: "error", text: t("boosters.errors.unexpected") });
      }
      router.refresh();
    });

  const toggle = (slug: string) => {
    setMessage(null);
    setDraft((d) => (d.includes(slug) ? d.filter((s) => s !== slug) : [...d, slug]));
  };

  return (
    <fieldset className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <legend className="px-1 font-title text-lg font-bold">{title}</legend>
      <p className="text-xs text-text-muted">{pinned ? t("rotation.pinned") : t("rotation.random")}</p>
      {candidates.length === 0 ? (
        <p className="text-sm text-text-muted">{t("rotation.empty")}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {candidates.map((c) => (
            <li key={c.slug}>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-control border border-border bg-surface-2 px-3 has-checked:border-shu">
                <input
                  type="checkbox"
                  checked={draft.includes(c.slug)}
                  onChange={() => toggle(c.slug)}
                  className="size-5 accent-shu-btn"
                />
                <span aria-hidden="true" lang="ja" className="font-seal text-shu">
                  {c.emblem}
                </span>
                <span className="min-w-0 truncate text-sm font-bold">{c.name}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="primary" disabled={pending || draft.length === 0 || !changed} onClick={() => send(draft)}>
          {t("rotation.save", { count: draft.length })}
        </Button>
        {pinned && (
          <Button type="button" disabled={pending} onClick={() => send(null)}>
            {t("rotation.clear")}
          </Button>
        )}
        {message && (
          <span role="status" className={`text-sm ${message.tone === "ok" ? "text-text-muted" : "text-shu"}`}>
            {message.text}
          </span>
        )}
      </div>
    </fieldset>
  );
}
