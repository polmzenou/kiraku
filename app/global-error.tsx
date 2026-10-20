"use client";

import "./globals.css";

/**
 * Dernier filet : une erreur dans le layout lui-même. Il remplace tout le document, sans
 * next-intl ni thème : le texte est donc fixe, dans les deux langues, et ne dit rien de l'erreur.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="fr" data-theme="yoru">
      <body className="flex min-h-dvh flex-col items-start justify-center gap-4 px-4 py-10">
        <h1 className="text-2xl font-bold">Une erreur est survenue · Something went wrong</h1>
        <p className="text-text-muted">Réessaie dans un instant. · Please try again in a moment.</p>
        <button
          type="button"
          onClick={reset}
          className="inline-flex min-h-11 items-center rounded-control bg-shu-btn px-5 font-medium text-washi-paper"
        >
          Réessayer · Try again
        </button>
      </body>
    </html>
  );
}
