"use client";

import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import {
  grantLotToUserAction,
  resumeLotBroadcastAction,
  startLotBroadcastAction,
  type AdminLotResult,
} from "@/server/actions/admin-lots";
import { Button } from "../ui/Button";
import { NoteField } from "../ui/NoteField";
import { ConfirmAction } from "./ConfirmAction";
import { inputClass } from "./fields";

/** Envoyer un lot actif : à un joueur (pseudo), ou à tous (confirmé, par paquets, reprenable). */
export function LotSendPanel({ lots }: { lots: { id: string; name: string }[] }) {
  const t = useTranslations("admin.lotSend");
  const ids = { lot: useId(), user: useId(), reason: useId(), audience: useId() };
  const [lotId, setLotId] = useState(lots[0]?.id ?? "");
  const [username, setUsername] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [audience, setAudience] = useState<"ALL" | "REGISTERED">("REGISTERED");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const describe = (r: AdminLotResult) =>
    r.ok
      ? r.done === false
        ? t("partial", { count: r.granted ?? 0 })
        : t("sent", { count: r.granted ?? 0 })
      : t(`errors.${r.error}`);

  if (lots.length === 0) return <p className="text-sm text-text-muted">{t("noActiveLot")}</p>;

  return (
    <section className="flex flex-col gap-4 lacquer rounded-card p-4">
      <h3 className="font-title text-lg font-bold">{t("title")}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={ids.lot} className="text-sm">
            {t("lot")}
          </label>
          <select id={ids.lot} value={lotId} onChange={(e) => setLotId(e.target.value)} className={inputClass}>
            {lots.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={ids.reason} className="text-sm">
            {t("reason")}
          </label>
          <input id={ids.reason} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} className={inputClass} />
          <p className="text-xs text-text-muted">{t("reasonHint")}</p>
        </div>
      </div>
      <NoteField label={t("message")} placeholder={t("messagePlaceholder")} value={note} onChange={setNote} />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor={ids.user} className="text-sm">
            {t("username")}
          </label>
          <input
            id={ids.user}
            value={username}
            maxLength={20}
            autoCapitalize="none"
            spellCheck={false}
            onChange={(e) => setUsername(e.target.value)}
            className={inputClass}
          />
        </div>
        <Button
          type="button"
          disabled={pending || username.trim().length < 3}
          onClick={() =>
            startTransition(async () => {
              const r = await grantLotToUserAction({ lotId, username, reason, message: note });
              setMessage({ ok: r.ok, text: describe(r) });
            })
          }
        >
          {t("sendToUser")}
        </Button>
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor={ids.audience} className="text-sm">
            {t("audience")}
          </label>
          <select
            id={ids.audience}
            value={audience}
            onChange={(e) => setAudience(e.target.value === "ALL" ? "ALL" : "REGISTERED")}
            className={inputClass}
          >
            <option value="REGISTERED">{t("audiences.REGISTERED")}</option>
            <option value="ALL">{t("audiences.ALL")}</option>
          </select>
        </div>
        <ConfirmAction
          label={t("sendToAll")}
          title={t("sendToAllTitle")}
          description={<p>{t("sendToAllBody")}</p>}
          confirmLabel={t("sendToAllConfirm")}
          typeToConfirm={t("confirmWord")}
          onConfirm={async (typed) => {
            const r = await startLotBroadcastAction({ lotId, audience, reason, message: note, confirm: typed });
            setMessage({ ok: r.ok, text: describe(r) });
            return r.ok ? null : t(`errors.${r.error}`);
          }}
        />
      </div>

      {message && (
        <p role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-text-muted" : "text-shu"}`}>
          {message.text}
        </p>
      )}
    </section>
  );
}

/** « Reprendre » un envoi à tous resté en cours. */
export function ResumeBroadcastButton({ broadcastId }: { broadcastId: string }) {
  const t = useTranslations("admin.lotSend");
  const [text, setText] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await resumeLotBroadcastAction({ broadcastId });
            setText(r.ok ? (r.done ? t("sent", { count: r.granted ?? 0 }) : t("partial", { count: r.granted ?? 0 })) : t(`errors.${r.error}`));
          })
        }
      >
        {pending ? t("pending") : t("resume")}
      </Button>
      {text && <p className="text-xs text-text-muted">{text}</p>}
    </div>
  );
}
