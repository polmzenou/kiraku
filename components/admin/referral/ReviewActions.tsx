"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Link } from "@/i18n/navigation";
import {
  rescoreReferralAction,
  reviewReferralAction,
  revokePreviewAction,
  type ReferralStaffError,
  type RevokePreviewLine,
} from "@/server/actions/admin-referral";
import { Button, buttonClasses } from "../../ui/Button";
import { FormMessage, TextField } from "../fields";

type Preview = { lines: RevokePreviewLine[]; milestones: number[]; referrer: string };

/**
 * Décisions de l'équipe sur un parrainage v2 (ADMIN et DEV) : valider et verser, révoquer (motif), révoquer et bannir
 * (motif, avec l'aperçu de ce qui sera repris, calculé à l'ouverture), recalculer le score. `state` décide des boutons.
 */
export function ReviewActions({ referralId, state, ficheHref }: { referralId: string; state: "HELD" | "ACTIVE" | "REVOKED" | "BANNED"; ficheHref?: string }) {
  const t = useTranslations("admin.referralV2.actions");
  const [mode, setMode] = useState<"REVOKE" | "BAN" | null>(null);
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<Preview | "loading" | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const fail = (error: ReferralStaffError) => setMessage({ tone: "error", text: t(`errors.${error}`) });

  function open(next: "REVOKE" | "BAN") {
    setMessage(null);
    setMode(next);
    if (next !== "BAN") return;
    setPreview("loading");
    startTransition(async () => {
      const res = await revokePreviewAction({ referralId });
      if (res.ok) setPreview({ lines: res.lines, milestones: res.milestones, referrer: res.referrer });
      else {
        setPreview(null);
        fail(res.error);
      }
    });
  }

  function decide(decision: "VALIDATE" | "REVOKE" | "BAN") {
    setMessage(null);
    startTransition(async () => {
      const res = await reviewReferralAction({ referralId, decision, reason: decision === "VALIDATE" ? null : reason.trim() });
      if (!res.ok) return fail(res.error);
      setMode(null);
      setReason("");
      setMessage({
        tone: "ok",
        text: decision === "VALIDATE" ? t("done.validate", { count: res.paid }) : decision === "BAN" ? t("done.ban", { count: res.banned }) : t("done.revoke"),
      });
    });
  }

  function rescore() {
    setMessage(null);
    startTransition(async () => {
      const res = await rescoreReferralAction({ referralId });
      if (res.ok) setMessage({ tone: "ok", text: t(res.held ? "done.rescoreHeld" : "done.rescore") });
      else fail(res.error);
    });
  }

  if (state === "BANNED") return <p className="text-sm text-text-muted">{t("bannedNote")}</p>;

  return (
    <div className="flex flex-col gap-3">
      {mode === null ? (
        <div className="flex flex-wrap gap-2">
          {state === "HELD" && (
            <Button type="button" variant="primary" size="sm" disabled={pending} onClick={() => decide("VALIDATE")}>
              {t("validate")}
            </Button>
          )}
          {state !== "HELD" && (
            <Button type="button" size="sm" disabled={pending} onClick={rescore}>
              {t("rescore")}
            </Button>
          )}
          {state !== "REVOKED" && (
            <Button type="button" size="sm" disabled={pending} onClick={() => open("REVOKE")}>
              {t("revoke")}
            </Button>
          )}
          <Button type="button" variant="danger" size="sm" disabled={pending} onClick={() => open("BAN")}>
            {t("ban")}
          </Button>
          {ficheHref && (
            <Link href={ficheHref} className={buttonClasses("ghost", "", "sm")}>
              {t("fiche")}
            </Link>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-card border border-shu/40 bg-shu/5 p-3">
          <p className="text-sm">{t(mode === "BAN" ? "banIntro" : "revokeIntro")}</p>
          {mode === "BAN" &&
            (preview === "loading" ? (
              <p className="text-sm text-text-muted" role="status">{t("loading")}</p>
            ) : preview ? (
              <ul className="flex flex-col divide-y divide-border rounded-control border border-border bg-surface text-sm">
                {preview.lines.length === 0 && <li className="px-3 py-2 text-text-muted">{t("nothing")}</li>}
                {preview.lines.map((l, i) => (
                  <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-3 px-3 py-2">
                    <span>{t(`line.${l.what}`, { user: l.user, name: l.name ?? "" })}</span>
                    <span className="tabular-nums">
                      <b>{t("takenOf", { taken: l.taken, given: l.given })}</b>
                      {l.given > l.taken && <span className="text-text-muted"> · {t(l.what === "ZENI" ? "spent" : "used", { count: l.given - l.taken })}</span>}
                    </span>
                  </li>
                ))}
                <li className="px-3 py-2 text-text-muted">
                  {preview.milestones.length
                    ? t("milestones", { name: preview.referrer, list: preview.milestones.join(", ") })
                    : t("milestonesNone", { name: preview.referrer })}
                </li>
              </ul>
            ) : null)}
          <TextField label={t("reason")} value={reason} onChange={setReason} maxLength={300} hint={t("reasonHint")} />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="danger"
              size="sm"
              disabled={pending || reason.trim() === "" || (mode === "BAN" && preview === "loading")}
              onClick={() => decide(mode)}
            >
              {pending ? t("pending") : t(mode === "BAN" ? "confirmBan" : "confirmRevoke")}
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setMode(null)}>
              {t("cancel")}
            </Button>
          </div>
        </div>
      )}
      <FormMessage message={message} />
    </div>
  );
}
