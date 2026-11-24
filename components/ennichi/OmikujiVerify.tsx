"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { verifyOmikuji, type OmikujiProof, type OmikujiVerification } from "@/lib/ennichi/omikuji";
import { Button } from "../ui/Button";
import { Sheet } from "../ui/Sheet";

/**
 * Feuille « Vérifier le tirage » (maquette « En bref ») : ce téléphone ou cet ordinateur refait tout le tirage avec la
 * graine révélée et la liste figée des tickets (lib/ennichi/omikuji.ts, Web Crypto), et compare avec les résultats.
 * Avant le tirage, l'empreinte publiée au lancement et la règle.
 */
export function OmikujiVerify({ proof, seedHash, myLine, drawnAt }: { proof: OmikujiProof | null; seedHash: string | null; myLine: string; drawnAt: string | null }) {
  const t = useTranslations("ennichi.verify");
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<OmikujiVerification | null | "running" | "error">(null);

  async function run() {
    if (!proof) return;
    setResult("running");
    try {
      setResult(await verifyOmikuji(proof));
    } catch {
      setResult("error");
    }
  }

  const ok = result && typeof result === "object" && result.commitOk && result.ticketsOk && result.drawsOk;
  return (
    <>
      <Button
        type="button"
        size="sm"
        onClick={() => {
          setOpen(true);
          if (proof && result === null) void run();
        }}
      >
        {t("open")}
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t("title")}>
        <div className="enn">
          <div className="verify">
            {!proof ? (
              <div className="ok-line m3-pending">{drawnAt ? t("drawnAt", { date: drawnAt }) : t("pending")}</div>
            ) : result === "running" || result === null ? (
              <div className="ok-line m3-pending">{t("running")}</div>
            ) : ok ? (
              <div className="ok-line">✓ {t("ok")}</div>
            ) : (
              <div className="ok-line m3-pending">{t("ko")}</div>
            )}
            <p className="text-xs text-text-muted">{proof ? t("explainDone", { tickets: proof.tickets.length, lots: proof.draws.length }) : t("explainBefore")}</p>
            <p className="text-xs text-text-muted">
              <b className="text-text">{t("ruleLabel")}</b> {t("rule")}
            </p>
            <div className="m3-myline">
              <span className="text-[11px] font-bold tracking-wide text-text-muted uppercase">{t("myLine")}</span>
              <span>{myLine}</span>
            </div>
            <details>
              <summary className="text-xs">{t("prints")}</summary>
              <div className="mt-1.5 text-xs">{t("seedHash")}</div>
              <span className="hash">{seedHash ?? "—"}</span>
              <div className="mt-1.5 text-xs">{t("seed")}</div>
              <span className="hash">{proof?.seed ?? t("notRevealed")}</span>
              <div className="mt-1.5 text-xs">{t("ticketsHash")}</div>
              <span className="hash">{proof?.ticketsHash ?? t("notRevealed")}</span>
            </details>
          </div>
        </div>
      </Sheet>
    </>
  );
}
