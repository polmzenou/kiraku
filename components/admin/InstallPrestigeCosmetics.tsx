"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { adminInstallPrestigeCosmeticsAction } from "@/server/actions/admin-prestige";
import { Button } from "../ui/Button";
import { FormMessage } from "./fields";

/** Installe le jeu de cosmétiques du prestige ; seuls les absents sont créés (rien n'est écrasé). */
export function InstallPrestigeCosmetics() {
  const t = useTranslations("admin.prestige.cosmetics");
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await adminInstallPrestigeCosmeticsAction({});
            setMessage(res.ok ? { tone: "ok", text: t("done", { count: res.created }) } : { tone: "error", text: t(`errors.${res.error}`) });
          })
        }
      >
        {pending ? t("installing") : t("install")}
      </Button>
      <FormMessage message={message} />
    </div>
  );
}
