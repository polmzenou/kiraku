import type { ReactNode } from "react";

/** Commentaire d'un joueur, affiché tel quel (texte brut) ; `action` accueille la poubelle de l'admin. */
export function NoteText({ text, label, action, className = "" }: { text: string; label?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={`flex items-start gap-2 ${className}`}>
      <blockquote className="min-w-0 flex-1 whitespace-pre-line break-words border-l-2 border-kin/60 pl-3 text-sm">
        {label && <span className="block text-xs text-text-muted">{label}</span>}
        {text}
      </blockquote>
      {action}
    </div>
  );
}
