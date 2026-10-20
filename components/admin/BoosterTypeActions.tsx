"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { recomputePoolsAction, toggleBoosterType } from "@/server/actions/admin-boosters";
import { Button } from "../ui/Button";

/** Bouton « Recalculer les pools » (après un import lancé à la main, par exemple). */
export function RecomputePoolsButton() {
  const t = useTranslations("admin");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await recomputePoolsAction();
            setMessage(res.ok ? t("types.recomputed", { count: res.count }) : t(`form.errors.${res.error}`, { count: 0 }));
            router.refresh();
          })
        }
      >
        {t("types.recompute")}
      </Button>
      <span aria-live="polite" className="text-sm text-text-muted">
        {message}
      </span>
    </span>
  );
}

/** Activer / désactiver un type (refusé côté serveur si son pool est trop petit). */
export function ToggleTypeButton({ slug, active }: { slug: string; active: boolean }) {
  const t = useTranslations("admin");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Button
        variant={active ? "secondary" : "primary"}
        className="min-h-9 px-3 text-sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await toggleBoosterType({ slug, active: !active });
            setError(res.ok ? null : t(`form.errors.${res.error}`, { count: res.poolSize ?? 0 }));
            router.refresh();
          })
        }
      >
        {active ? t("types.deactivate") : t("types.activate")}
      </Button>
      {error && (
        <span role="alert" className="text-xs text-shu">
          {error}
        </span>
      )}
    </span>
  );
}
