"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "../ui/Button";

export type HelpTopic = "fete" | "lanternes" | "banzuke" | "omikuji";
const KANJI: Record<HelpTopic, string> = { fete: "祭", lanternes: "灯", banzuke: "番", omikuji: "籤" };

/**
 * « ? » d'une partie de l'Ennichi (maquette « Carte dorée ») : une explication d'un écran, sur une carte bordée d'or,
 * l'illustration de la partie en haut. Les phrases sont calculées par la page (réglages en vigueur) et passées ici.
 */
export function HelpButton({ topic, name, lines, art, className = "" }: { topic: HelpTopic; name: string; lines: ReactNode[]; art: ReactNode; className?: string }) {
  const t = useTranslations("ennichi.help");
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <>
      <button type="button" className={`q ${className}`} aria-label={t("label", { name })} onClick={() => setOpen(true)}>
        ?
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current?.close();
        }}
        className="enn fixed inset-x-0 top-auto bottom-0 m-0 w-full max-w-none bg-transparent p-3 text-text backdrop:bg-black/60 md:inset-0 md:m-auto md:h-fit md:w-[min(30rem,calc(100vw-4rem))]"
      >
        <div className="m3-gold">
          <div className="m3-gold-in">
            <div className="expl">
              {art}
              <div className="expl-body">
                <div className="flex items-center gap-3">
                  <span aria-hidden="true" lang="ja" className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-shu-btn font-seal text-lg text-washi-paper">
                    {KANJI[topic]}
                  </span>
                  <h3 id={titleId}>{t(`${topic}.title`)}</h3>
                </div>
                <ol>
                  {lines.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ol>
                <Button type="button" variant="primary" onClick={() => dialog.current?.close()}>
                  {t("close")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </dialog>
    </>
  );
}
