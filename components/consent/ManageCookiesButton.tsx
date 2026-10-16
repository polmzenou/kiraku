"use client";

import { useTranslations } from "next-intl";
import { openConsentPanel } from "@/lib/consent/consent-dom";
import { Button } from "../ui/Button";

/** « Gérer les cookies » : rouvre le panneau de consentement, partout dans le site. */
export function ManageCookiesButton({ className = "", variant = "button" }: { className?: string; variant?: "button" | "link" }) {
  const t = useTranslations("consent");
  if (variant === "link") {
    return (
      <button
        type="button"
        onClick={openConsentPanel}
        className={`inline-flex min-h-11 items-center py-2 text-left text-sm font-medium underline-offset-4 transition-colors hover:text-text hover:underline ${className}`}
      >
        {t("manage")}
      </button>
    );
  }
  return (
    <Button type="button" onClick={openConsentPanel} className={className}>
      {t("manage")}
    </Button>
  );
}
