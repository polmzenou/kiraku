"use client";

import { useTranslations } from "next-intl";
import { useEffect, useEffectEvent, useId, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { receiveKyaraPayloadAction, type KyaraStaffError } from "@/server/actions/admin-kyara";
import { Button } from "../../ui/Button";
import { inputClass } from "../../ui/Field";

// Le fragment d'URL (#v1z.<lot>) n'est lu qu'une fois, puis effacé de l'adresse : il ne reste ni dans l'historique
// ni dans un partage d'écran ; la garde `sent` empêche le double rendu du mode strict de l'envoyer deux fois.
let captured: string | null | undefined;
let sent: string | null = null;
function captureFragment(): string | null {
  if (captured !== undefined) return captured;
  const hash = window.location.hash.replace(/^#/, "");
  captured = hash.length > 0 ? hash : null;
  if (captured) window.history.replaceState(null, "", window.location.pathname + window.location.search);
  return captured;
}
const noop = () => () => {};

/** Réception du lot du favori : envoi au serveur, confirmation si l'avatar Kyara ne porte pas d'ID Discord. */
export function KyaraReceiver() {
  const t = useTranslations("admin.kyara.receive");
  const tError = useTranslations("admin.kyara.errors");
  const router = useRouter();
  const id = useId();
  const fromUrl = useSyncExternalStore(noop, captureFragment, () => null);
  const [pastedLot, setPastedLot] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const [error, setError] = useState<KyaraStaffError | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const lot = pastedLot ?? fromUrl;

  const send = (value: string, confirmWithoutDiscord: boolean) =>
    start(async () => {
      setError(null);
      const res = await receiveKyaraPayloadAction({ fragment: value, confirmWithoutDiscord });
      if (res.ok) router.replace(`/admin/kyara/${res.importId}`);
      else setError(res.error);
    });
  const sendFromUrl = useEffectEvent((value: string) => send(value, false));

  useEffect(() => {
    if (!fromUrl || sent === fromUrl) return;
    sent = fromUrl;
    sendFromUrl(fromUrl);
  }, [fromUrl]);

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      {pending && <p role="status">{t("sending")}</p>}
      {error && (
        <p role="alert" className="font-bold text-shu">
          {tError(error)}
        </p>
      )}
      {error === "DISCORD_UNVERIFIED" && lot && (
        <div className="flex flex-col gap-2 lacquer rounded-card p-4">
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input type="checkbox" className="choice" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
            {t("confirmNoDiscord")}
          </label>
          <Button type="button" variant="primary" disabled={!confirm || pending} onClick={() => send(lot, true)} className="w-fit">
            {t("confirmSend")}
          </Button>
        </div>
      )}
      {!lot && !pending && <p className="text-sm text-text-muted">{t("empty")}</p>}
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const value = pasted.trim().replace(/^.*#/, "");
          if (!value) return;
          setPastedLot(value);
          send(value, false);
        }}
      >
        <label htmlFor={id} className="text-sm font-bold">
          {t("pasteLabel")}
        </label>
        <textarea id={id} rows={3} value={pasted} onChange={(e) => setPasted(e.target.value)} className={`${inputClass} py-2 text-xs break-all`} />
        <Button type="submit" disabled={pending || pasted.trim() === ""} className="w-fit">
          {t("pasteSend")}
        </Button>
      </form>
    </div>
  );
}
