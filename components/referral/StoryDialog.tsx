"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { Link } from "@/i18n/navigation";
import { REFERRAL_IMAGES } from "@/lib/referral/assets";
import { Button, buttonClasses } from "../ui/Button";
import { useAnnouncementDialog } from "../welcome/useAnnouncementDialog";
import "./story.css";

// Enveloppe fermée, recadrée sur son rabat et son sceau d'or (maquette « Enveloppe »)
const POCHI = REFERRAL_IMAGES["pochi/fermee"];
const ENV_TOP = { backgroundImage: `url(${POCHI.src})`, backgroundSize: "140.9% auto", backgroundPosition: "50% 35.3%", backgroundRepeat: "no-repeat" };

type Props = { panes: ReactNode[]; canInvite: boolean; mode: "announce" | "how" };

/**
 * Fenêtre des écrans du parrainage : l'enveloppe, la feuille de l'écran en cours (rendue au serveur), les points, puis
 * « Suivant », et au dernier écran « Plus tard » (annonce seulement) et « Inviter un ami » (« Compris » pour un invité).
 * Revient au premier écran à chaque fermeture.
 */
function StoryDialog({ dialogRef, panes, canInvite, mode }: Props & { dialogRef: RefObject<HTMLDialogElement | null> }) {
  const t = useTranslations("referralV2.story");
  const common = useTranslations("common");
  const [index, setIndex] = useState(0);
  const moved = useRef(false);
  const scroller = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const last = index >= panes.length - 1;
  const close = () => dialogRef.current?.close();

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const reset = () => {
      moved.current = false;
      setIndex(0);
    };
    el.addEventListener("close", reset);
    return () => el.removeEventListener("close", reset);
  }, [dialogRef]);

  // Écran suivant : on remonte en haut de la feuille et le titre reçoit le focus (lecteurs d'écran)
  useEffect(() => {
    if (!moved.current) return;
    scroller.current?.scrollTo({ top: 0 });
    scroller.current?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
  }, [index]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClick={(event) => {
        if (event.target === dialogRef.current) close();
      }}
      className="fixed inset-0 m-auto max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] max-w-md overflow-hidden bg-transparent p-0 text-text opacity-0 transition-[opacity,translate,display,overlay] transition-discrete duration-300 backdrop:bg-black/75 backdrop:backdrop-blur-sm open:flex open:translate-y-0 open:flex-col open:opacity-100 starting:open:translate-y-4 starting:open:opacity-0 motion-reduce:transition-none"
    >
      <span id={titleId} className="sr-only">
        {t("label")}
      </span>
      <button
        type="button"
        aria-label={common("close")}
        onClick={close}
        className="absolute top-1 right-1 z-10 flex size-11 items-center justify-center rounded-full border border-border bg-bg/80 text-2xl text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
      >
        <span aria-hidden="true">×</span>
      </button>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3.5 pt-3.5">
        <div aria-hidden="true" className="story-env-top" style={ENV_TOP} />
        <div key={index} className="story-paper">
          {panes[index]}
          <p className="sr-only">{t("pane", { n: index + 1, count: panes.length })}</p>
          <div aria-hidden="true" className="mt-1 flex justify-center gap-1.5">
            {panes.map((_, i) => (
              <i key={i} className={`h-1.5 rounded-pill ${i === index ? "w-5 bg-shu-btn" : "w-1.5 bg-[#d0c4ad]"}`} />
            ))}
          </div>
        </div>
      </div>
      <div className="flex gap-2 p-3.5">
        {!last ? (
          <Button
            type="button"
            variant="primary"
            size="lg"
            className="w-full"
            onClick={() => {
              moved.current = true;
              setIndex((i) => Math.min(panes.length - 1, i + 1));
            }}
          >
            {t("next")}
          </Button>
        ) : (
          <>
            {mode === "announce" && (
              <Button type="button" size="lg" className="flex-1" onClick={close}>
                {t("later")}
              </Button>
            )}
            {canInvite ? (
              <Link href="/parrainage#ton-lien" onClick={close} className={buttonClasses("primary", "flex-1", "lg")}>
                {t("invite")}
              </Link>
            ) : (
              <Button type="button" variant="primary" size="lg" className="flex-1" onClick={close}>
                {t("gotIt")}
              </Button>
            )}
          </>
        )}
      </div>
    </dialog>
  );
}

/** Annonce du lancement : présentée une fois par compte, sur un écran de découverte (useAnnouncementDialog). */
export function ReferralStoryAnnouncement({ userId, ...props }: Omit<Props, "mode"> & { userId: string }) {
  const dialog = useAnnouncementDialog(userId, "referral");
  return <StoryDialog dialogRef={dialog} mode="announce" {...props} />;
}

/** « Comment ça marche » : les mêmes écrans, rouverts à tout moment depuis la page du parrainage. */
export function ReferralStoryButton({ className = "", ...props }: Omit<Props, "mode"> & { className?: string }) {
  const t = useTranslations("referralV2.story");
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={className}
        onClick={() => {
          dialog.current?.showModal();
          dialog.current?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
        }}
      >
        <span aria-hidden="true" lang="ja" className="font-seal text-base text-shu">
          ？
        </span>
        {t("how")}
      </Button>
      <StoryDialog dialogRef={dialog} mode="how" {...props} />
    </>
  );
}
