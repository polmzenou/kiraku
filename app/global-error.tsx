"use client";

import { useEffect } from "react";
import { clientErrorReport, sendClientError } from "@/lib/errors/client-report";
import "./globals.css";

/**
 * Dernier filet : une erreur dans le layout lui-même. Il remplace tout le document, sans
 * next-intl ni thème : le texte est donc fixe, dans les deux langues, et ne dit rien de l'erreur.
 * L'erreur part dans les logs du serveur (app/api/client-error). « Réessayer » relit la page sur le serveur
 * (`retry`) : `reset` seul rejouait la réponse déjà reçue, en erreur.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    sendClientError(clientErrorReport(error, window.location.pathname, "global"));
  }, [error]);
  return (
    <html lang="fr" data-theme="yoru">
      <body className="flex min-h-dvh flex-col items-start justify-center gap-4 px-4 py-10">
        <h1 className="text-2xl font-bold">Une erreur est survenue · Something went wrong</h1>
        <p className="text-text-muted">Réessaie dans un instant. · Please try again in a moment.</p>
        <button
          type="button"
          onClick={retry}
          className="inline-flex min-h-11 items-center rounded-control bg-shu-btn px-5 font-medium text-washi-paper"
        >
          Réessayer · Try again
        </button>
      </body>
    </html>
  );
}
