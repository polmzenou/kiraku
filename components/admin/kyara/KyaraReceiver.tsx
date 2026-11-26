"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useEffectEvent, useId, useState, useSyncExternalStore, useTransition } from "react";
import { Link } from "@/i18n/navigation";
import { receiveKyaraPayloadAction, type KyaraReceiveFail, type KyaraReceiveOk } from "@/server/actions/admin-kyara";
import { Button } from "../../ui/Button";
import { inputClass } from "../../ui/Field";

// Le fragment d'URL (#v2z.<lot>) n'est lu qu'une fois, puis effacé de l'adresse : il ne reste ni dans l'historique
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

export type PendingKyaraRequest = { id: string; username: string; requestedAt: string };

/**
 * Réception du lot du favori : envoi au serveur, puis le résultat (versé, ou gardé « à vérifier »). Avatar Kyara sans
 * ID Discord : l'équipe choisit la demande du joueur et confirme ; la lecture attend alors dans « À vérifier ».
 */
export function KyaraReceiver({ pending: requests }: { pending: PendingKyaraRequest[] }) {
  const t = useTranslations("admin.kyara.receive");
  const tKyara = useTranslations("admin.kyara");
  const tError = useTranslations("admin.kyara.errors");
  const format = useFormatter();
  const pasteId = useId();
  const pickId = useId();
  const fromUrl = useSyncExternalStore(noop, captureFragment, () => null);
  const [pastedLot, setPastedLot] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const [result, setResult] = useState<KyaraReceiveOk | null>(null);
  const [failure, setFailure] = useState<KyaraReceiveFail | null>(null);
  const [picked, setPicked] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  // Dernier envoi : le lot reste en mémoire (il n'est plus dans l'adresse) pour « Réessayer » après une coupure
  const [lastSent, setLastSent] = useState<{ value: string; importId: string | null } | null>(null);
  const lot = pastedLot ?? fromUrl;

  const send = (value: string, importId: string | null) =>
    start(async () => {
      setFailure(null);
      setResult(null);
      setLastSent({ value, importId });
      try {
        const res = await receiveKyaraPayloadAction({ fragment: value, importId, confirmWithoutDiscord: importId !== null });
        if (res.ok) setResult(res);
        else setFailure(res);
      } catch {
        // Réseau coupé, action introuvable après une mise à jour : le lot n'est pas perdu
        setFailure({ ok: false, error: "UNAVAILABLE" });
      }
    });
  const sendFromUrl = useEffectEvent((value: string) => send(value, null));

  useEffect(() => {
    if (!fromUrl || sent === fromUrl) return;
    sent = fromUrl;
    sendFromUrl(fromUrl);
  }, [fromUrl]);

  const player = (name: string | null) => name ?? tKyara("queue.deletedPlayer");

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      {pending && <p role="status">{t("sending")}</p>}

      {result && (
        <div role="status" className="flex flex-col gap-2 lacquer rounded-card p-4">
          <p className={`font-bold ${result.status === "DONE" ? "text-hisui" : "text-kin"}`}>
            {result.status === "DONE"
              ? t("done", { player: player(result.player), cards: result.cards, zeni: result.zeni })
              : t("review", { player: player(result.player), reason: tKyara(`reviewReasons.${result.reason}`) })}
          </p>
          <Link href={`/admin/kyara/${result.importId}`} className="w-fit text-sm font-bold underline underline-offset-4">
            {t("openDetail")}
          </Link>
          <p className="text-sm text-text-muted">{t("next")}</p>
        </div>
      )}

      {failure && (
        <div role="alert" className="flex flex-col gap-1">
          <p className="font-bold text-shu">{tError(failure.error)}</p>
          {failure.profile && <p className="text-sm text-text-muted">{t("readProfile", { pseudo: failure.profile.pseudo ?? "—" })}</p>}
          {(failure.error === "UNAVAILABLE" || failure.error === "RATE_LIMITED") && lastSent && (
            <Button type="button" disabled={pending} onClick={() => send(lastSent.value, lastSent.importId)} className="w-fit">
              {t("retry")}
            </Button>
          )}
        </div>
      )}

      {failure?.error === "DISCORD_UNVERIFIED" && lot && (
        <div className="flex flex-col gap-3 lacquer rounded-card p-4">
          <h3 className="font-title text-lg font-bold">{t("matchTitle")}</h3>
          <p className="text-sm text-text-muted">{t("matchHelp")}</p>
          {requests.length === 0 ? (
            <p className="text-sm">{t("matchNone")}</p>
          ) : (
            <>
              <label htmlFor={pickId} className="text-sm font-bold">
                {t("matchLabel")}
              </label>
              <select id={pickId} value={picked} onChange={(e) => setPicked(e.target.value)} className={inputClass}>
                <option value="">{t("matchPlaceholder")}</option>
                {requests.map((r) => (
                  <option key={r.id} value={r.id}>
                    {t("matchOption", { player: r.username, date: format.dateTime(new Date(r.requestedAt), { dateStyle: "medium" }) })}
                  </option>
                ))}
              </select>
              <label className="flex min-h-11 items-center gap-3 text-sm">
                <input type="checkbox" className="choice" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
                {t("confirmNoDiscord")}
              </label>
              <Button type="button" variant="primary" disabled={!confirm || picked === "" || pending} onClick={() => send(lot, picked)} className="w-fit">
                {t("confirmSend")}
              </Button>
            </>
          )}
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
          setConfirm(false);
          setPicked("");
          send(value, null);
        }}
      >
        <label htmlFor={pasteId} className="text-sm font-bold">
          {t("pasteLabel")}
        </label>
        <textarea id={pasteId} rows={3} value={pasted} onChange={(e) => setPasted(e.target.value)} className={`${inputClass} py-2 text-xs break-all`} />
        <Button type="submit" disabled={pending || pasted.trim() === ""} className="w-fit">
          {t("pasteSend")}
        </Button>
      </form>
    </div>
  );
}
