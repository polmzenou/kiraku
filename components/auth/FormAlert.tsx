"use client";

import { useTranslations } from "next-intl";
import type { FormErrorCode } from "@/lib/auth/form-state";

export function FormAlert({ error }: { error?: FormErrorCode }) {
  const t = useTranslations("auth.errors");
  if (!error) return null;
  return (
    <p role="alert" className="rounded-button border border-shu px-3 py-2 text-sm text-shu">
      {t(error)}
    </p>
  );
}
