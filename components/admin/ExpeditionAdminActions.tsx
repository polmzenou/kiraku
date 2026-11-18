"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { deleteExpeditionTypeAction, recallExpeditionAction, seedExpeditionCatalogAction } from "@/server/actions/admin-expedition";
import { ConfirmAction } from "./ConfirmAction";

/** Installe le catalogue par défaut (modèles absents seulement). */
export function SeedExpeditionsButton() {
  const t = useTranslations("admin.expeditions");
  const router = useRouter();
  return (
    <ConfirmAction
      label={t("seed.label")}
      title={t("seed.title")}
      description={<p>{t("seed.description")}</p>}
      confirmLabel={t("seed.confirm")}
      variant="secondary"
      onConfirm={async () => {
        const res = await seedExpeditionCatalogAction({});
        if (!res.ok) return t(`errors.${res.error}`);
        router.refresh();
        return null;
      }}
    />
  );
}

/** Supprime un modèle jamais joué. */
export function DeleteExpeditionTypeButton({ id, name }: { id: string; name: string }) {
  const t = useTranslations("admin.expeditions");
  const router = useRouter();
  return (
    <ConfirmAction
      label={t("delete.label")}
      title={t("delete.title", { name })}
      description={<p>{t("delete.description")}</p>}
      confirmLabel={t("delete.confirm")}
      variant="ghost"
      onConfirm={async () => {
        const res = await deleteExpeditionTypeAction({ id });
        if (!res.ok) return t(`errors.${res.error}`);
        router.refresh();
        return null;
      }}
    />
  );
}

/** Rappelle une expédition en route : cartes rendues, aucun gain, aucune attente. */
export function RecallExpeditionButton({ id, username }: { id: string; username: string }) {
  const t = useTranslations("admin.expeditions");
  const router = useRouter();
  return (
    <ConfirmAction
      label={t("recall.label")}
      title={t("recall.title", { username })}
      description={<p>{t("recall.description")}</p>}
      confirmLabel={t("recall.confirm")}
      variant="secondary"
      onConfirm={async () => {
        const res = await recallExpeditionAction({ id });
        if (!res.ok) return t(`errors.${res.error}`);
        router.refresh();
        return null;
      }}
    />
  );
}
