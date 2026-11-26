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
            // Coupure réseau ou erreur relancée par l'action : un message sous le bouton, pas l'écran d'erreur
            const res = await adminInstallPrestigeCosmeticsAction({}).catch(() => null);
            if (!res) return setMessage({ tone: "error", text: t("errors.UNAVAILABLE") });
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
