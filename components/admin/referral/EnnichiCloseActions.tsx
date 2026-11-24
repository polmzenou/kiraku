"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Link } from "@/i18n/navigation";
import { checkEnnichiAction, drawEnnichiAction } from "@/server/actions/admin-referral";
import { Button } from "../../ui/Button";
import { FormMessage } from "../fields";

/**
 * Clôture de l'Ennichi, en deux temps (maquette « Tableau de bord ») : « Contrôler » recalcule le score de chaque
 * parrainage de la fête et remplit la file « À vérifier » ; « Arrêter et tirer », après une confirmation, fige le banzuke
 * et les tickets puis tire l'omikuji. Toute l'équipe (ADMIN et DEV) ; chaque action va au journal admin.
 */
export function EnnichiCloseActions({ edition, checked, held }: { edition: number; checked: boolean; held: number }) {
  const t = useTranslations("admin.referralV2.ennichi.close");
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function check() {
    setMessage(null);
    startTransition(async () => {
      const res = await checkEnnichiAction({ edition });
      if (!res.ok) return setMessage({ tone: "error", text: t(`errors.${res.error}`) });
      setMessage({ tone: "ok", text: t("checkedNow", { checked: res.checked, held: res.held }) });
    });
  }

  function draw() {
    setMessage(null);
    startTransition(async () => {
      const res = await drawEnnichiAction({ edition });
      setConfirm(false);
      if (!res.ok) return setMessage({ tone: "error", text: t(`errors.${res.error}`) });
      setMessage({ tone: "ok", text: t("drawnNow", { ranked: res.ranked, draws: res.draws, paid: res.paid, left: res.left }) });
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant={checked ? "secondary" : "primary"} size="sm" disabled={pending} onClick={check}>
          {t("check")}
        </Button>
        {held > 0 ? (
          <Link href="/admin/parrainage" className="inline-flex min-h-9 items-center rounded-pill border border-shu/60 bg-shu/10 px-3 text-xs font-bold text-shu">
            {t("held", { count: held })}
          </Link>
        ) : (
          checked && <span className="inline-flex min-h-9 items-center rounded-pill border border-hisui/60 px-3 text-xs font-bold text-hisui">{t("queueEmpty")}</span>
        )}
      </div>
      <p className="text-xs text-text-muted">{held > 0 ? t("drawHintHeld") : t("drawHint")}</p>
      {confirm ? (
        <div className="flex flex-col gap-2 rounded-control border border-border bg-surface-2 p-3">
          <p className="text-sm font-bold">{held > 0 ? t("confirmHeld", { count: held }) : t("confirm")}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="primary" size="sm" disabled={pending} onClick={draw}>
              {t("confirmDraw")}
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setConfirm(false)}>
              {t("cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant={checked ? "primary" : "secondary"} size="sm" className="self-start" disabled={pending} onClick={() => setConfirm(true)}>
          {t("draw")}
        </Button>
      )}
      <FormMessage message={message} />
    </div>
  );
}
