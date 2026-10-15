"use client";

import { useTranslations } from "next-intl";
import type { FormErrorCode } from "@/lib/auth/form-state";

export function FormAlert({ error }: { error?: FormErrorCode }) {
  const t = useTranslations("auth.errors");
  if (!error) return null;
  return (
    <p role="alert" className="flex items-start gap-2 rounded-button border border-shu/70 bg-shu/10 px-3 py-2.5 text-sm text-text">
      <span aria-hidden="true" lang="ja" className="font-seal text-shu">
        注
      </span>
      {t(error)}
    </p>
  );
}
