"use client";

import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { KYARA_REJECT_CODES, type KyaraRejectCode } from "@/lib/kyara/codes";
import {
  applyKyaraImportAction,
  rejectKyaraImportAction,
  reopenKyaraImportAction,
  rereadKyaraImportAction,
  type KyaraStaffError,
} from "@/server/actions/admin-kyara";
import { Button } from "../../ui/Button";
import { inputClass, selectClass } from "../../ui/Field";

type Props = {
  importId: string;
  status: "PENDING" | "READY" | "DONE" | "REJECTED" | "CANCELLED";
  /**
   * Aperçu validé par l'équipe (READY) : renvoyé tel quel au versement, qui le compare sous verrou. null : rien à
   * verser ici (lecture vide, ou gros lot que ce membre a reçu lui-même).
   */
  expected: { cards: number; zeni: number } | null;
};

/** Décisions sur une demande : valider (READY), relire (READY), refuser (PENDING ou READY), rouvrir (REJECTED). */
export function KyaraDecision({ importId, status, expected }: Props) {
  const t = useTranslations("admin.kyara.decision");
  const tCode = useTranslations("admin.kyara.rejectCodes");
  const tError = useTranslations("admin.kyara.errors");
  const id = useId();
  const [code, setCode] = useState<KyaraRejectCode>("NOT_FRIEND");
  const [note, setNote] = useState("");
  const [error, setError] = useState<KyaraStaffError | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (label: string, action: () => Promise<{ ok: true } | { ok: false; error: KyaraStaffError }>) =>
    start(async () => {
      setError(null);
      setDone(null);
      try {
        const res = await action();
        if (res.ok) setDone(label);
        else setError(res.error);
      } catch {
        // Réseau coupé, action introuvable après une mise à jour : la fiche reste affichée
        setError("UNAVAILABLE");
      }
    });

  return (
    <section className="flex flex-col gap-4 lacquer rounded-card p-4" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className="font-title text-lg font-bold">
        {t("title")}
      </h3>
      {/* Sans aperçu versable (lecture vide, gros lot reçu par ce membre) : seulement relire ou refuser */}
      {status === "READY" && (
        <div className="flex flex-wrap gap-2">
          {expected && (
            <Button
              type="button"
              variant="primary"
              disabled={pending}
              onClick={() => {
                if (!window.confirm(t("applyConfirm", { cards: expected.cards, zeni: expected.zeni }))) return;
                run(t("applied"), () => applyKyaraImportAction({ importId, expectedCards: expected.cards, expectedZeni: expected.zeni }));
              }}
            >
              {t("apply", { cards: expected.cards, zeni: expected.zeni })}
            </Button>
          )}
          <Button type="button" disabled={pending} onClick={() => run(t("reread"), () => rereadKyaraImportAction({ importId }))}>
            {t("rereadButton")}
          </Button>
        </div>
      )}
      {(status === "PENDING" || status === "READY") && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(t("rejected"), () => rejectKyaraImportAction({ importId, code, note: note.trim() === "" ? null : note.trim() }));
          }}
        >
          <label htmlFor={`${id}-code`} className="text-sm font-bold">
            {t("rejectCode")}
          </label>
          <select id={`${id}-code`} value={code} onChange={(e) => setCode(e.target.value as KyaraRejectCode)} className={selectClass}>
            {KYARA_REJECT_CODES.map((c) => (
              <option key={c} value={c}>
                {tCode(c)}
              </option>
            ))}
          </select>
          <label htmlFor={`${id}-note`} className="text-sm">
            {t(code === "OTHER" ? "noteRequired" : "noteOptional")}
          </label>
          <input id={`${id}-note`} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
          <Button type="submit" disabled={pending || (code === "OTHER" && note.trim() === "")} className="w-fit">
            {t("reject")}
          </Button>
        </form>
      )}
      {status === "REJECTED" && (
        <Button type="button" disabled={pending} onClick={() => run(t("reopened"), () => reopenKyaraImportAction({ importId }))} className="w-fit">
          {t("reopen")}
        </Button>
      )}
      {done && (
        <p role="status" className="text-sm font-bold text-hisui">
          {done}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm font-bold text-shu">
          {tError(error)}
        </p>
      )}
    </section>
  );
}
