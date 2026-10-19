"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { PROFILE_VISIBILITIES, type ProfileVisibility } from "@/lib/collection/visibility";
import { updatePrivacyAction } from "@/server/actions/collection";

/** Confidentialité du profil public : qui le voit, et si la collection complète y est montrée. */
export function PrivacyForm({ visibility, showCollection }: { visibility: ProfileVisibility; showCollection: boolean }) {
  const t = useTranslations("privacy");
  const [value, setValue] = useState({ visibility, showCollection });
  const [status, setStatus] = useState<"saved" | "error" | null>(null);
  const [pending, startTransition] = useTransition();

  const save = (next: typeof value) => {
    const previous = value;
    setValue(next);
    setStatus(null);
    startTransition(async () => {
      try {
        const res = await updatePrivacyAction(next);
        if (!res.ok) throw new Error(res.error);
        setStatus("saved");
      } catch {
        setValue(previous);
        setStatus("error");
      }
    });
  };

  return (
    <div className="flex flex-col gap-4" aria-busy={pending}>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-bold">{t("who")}</legend>
        {PROFILE_VISIBILITIES.map((v) => (
          <label
            key={v}
            className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-control border px-3 py-2.5 ${
              value.visibility === v ? "border-text bg-surface-2" : "border-border"
            }`}
          >
            <input
              type="radio"
              name="visibility"
              value={v}
              checked={value.visibility === v}
              onChange={() => save({ ...value, visibility: v })}
              className="mt-1 size-4 accent-shu"
            />
            <span className="flex flex-col">
              <span className="font-bold">{t(`levels.${v}.label`)}</span>
              <span className="text-sm text-text-muted">{t(`levels.${v}.hint`)}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-control border border-border px-3 py-2.5">
        <input
          type="checkbox"
          checked={value.showCollection}
          onChange={(e) => save({ ...value, showCollection: e.target.checked })}
          className="mt-1 size-4 accent-shu"
        />
        <span className="flex flex-col">
          <span className="font-bold">{t("showCollection")}</span>
          <span className="text-sm text-text-muted">{t("showCollectionHint")}</span>
        </span>
      </label>

      <p role="status" className={`text-sm ${status === "error" ? "text-shu" : "text-text-muted"}`}>
        {status === "saved" ? t("saved") : status === "error" ? t("error") : ""}
      </p>
    </div>
  );
}
