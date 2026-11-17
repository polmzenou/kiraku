"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { verifyFlip, type CoinSide, type FlipVerification } from "@/lib/casino/fairness";
import { SIDE_KANJI } from "@/lib/casino/media";
import { Sheet } from "../ui/Sheet";
import { CoinFace } from "./CoinFace";

/** Hexadécimal découpé en groupes de 8, lisible et coupable à la ligne. */
const groups = (hex: string) => hex.match(/.{1,8}/g)?.join(" ") ?? hex;

function Step({ n, title, sub, children, ok }: { n: number; title: string; sub: string; children?: React.ReactNode; ok?: boolean }) {
  return (
    <li className="flex gap-3">
      <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-2 text-sm font-bold text-kin ring-1 ring-border ring-inset">
        {n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <b className="text-sm">{title}</b>
        <small className="text-xs text-text-muted">{sub}</small>
        {children}
      </div>
      {ok !== undefined && (
        <span aria-hidden="true" className={`self-start text-lg font-bold ${ok ? "text-hisui" : "text-shu"}`}>
          {ok ? "✓" : "✗"}
        </span>
      )}
    </li>
  );
}

/**
 * Vérifier le tirage : l'empreinte publiée à l'ouverture, la graine révélée après le lancer, et le calcul refait
 * ici même (Web Crypto) : SHA-256 de la graine, puis HMAC-SHA256(graine, id de la table), dont le premier octet
 * pair donne 表 et impair 裏.
 */
export function VerifySheet({
  open,
  onClose,
  flipId,
  seed,
  seedHash,
  result,
}: {
  open: boolean;
  onClose: () => void;
  flipId: string;
  seed: string;
  seedHash: string;
  result: CoinSide;
}) {
  const t = useTranslations("casino.verify");
  const [check, setCheck] = useState<FlipVerification | null | "error">(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    verifyFlip({ tableId: flipId, seed, seedHash, result }).then(
      (v) => live && setCheck(v ?? "error"),
      () => live && setCheck("error"),
    );
    return () => {
      live = false;
    };
  }, [open, flipId, seed, seedHash, result]);

  const v = check && check !== "error" ? check : null;
  const byte = v ? Number.parseInt(v.digest.slice(0, 2), 16) : null;
  // Pas de police à chasse fixe (DA) : chiffres tabulaires, coupure entre les groupes de 8
  const hex = "rounded-control bg-surface-2 px-2 py-1 text-xs tracking-wide break-words tabular-nums";

  return (
    <Sheet open={open} onClose={onClose} title={t("title")}>
      <div className="flex flex-col gap-4 text-sm">
        <p className="text-text-muted">{t("intro")}</p>
        <ol className="flex flex-col gap-4">
          <Step n={1} title={t("hash")} sub={t("hashSub")}>
            <span className={hex}>{groups(seedHash)}</span>
          </Step>
          <Step n={2} title={t("seed")} sub={t("seedSub")}>
            <span className={hex}>{groups(seed)}</span>
          </Step>
          <Step n={3} title={t("sha")} sub={v ? (v.commitOk ? t("shaOk") : t("shaKo")) : t("computing")} ok={v ? v.commitOk : undefined} />
          <Step
            n={4}
            title={t("hmac")}
            sub={t("table", { id: flipId })}
            ok={v ? v.outcomeOk : undefined}
          >
            {v && byte !== null && (
              <small className="text-xs text-text-muted">
                {t("byte", { hex: v.digest.slice(0, 2), value: byte, parity: byte % 2 === 0 ? t("even") : t("odd"), side: SIDE_KANJI[v.side] })}
              </small>
            )}
          </Step>
        </ol>
        {check === "error" && (
          <p role="alert" className="font-bold text-shu">
            {t("unavailable")}
          </p>
        )}
        {v && (
          <div role="status" className="flex items-center gap-3 rounded-card bg-surface p-3 ring-1 ring-border ring-inset">
            <CoinFace side={v.side} size={44} />
            <div className="flex flex-col">
              <b>{t("result", { side: SIDE_KANJI[v.side] })}</b>
              <small className={v.commitOk && v.outcomeOk ? "text-hisui" : "text-shu"}>{v.commitOk && v.outcomeOk ? t("conform") : t("mismatch")}</small>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}
