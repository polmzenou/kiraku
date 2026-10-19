import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

// Champs Urushi : fond plein, sans bordure au repos, anneau ai au focus, anneau shu en erreur.
const control =
  "w-full min-w-0 rounded-control bg-surface-2 text-base text-text shadow-sheen outline-none placeholder:text-text-muted/80 " +
  "ring-inset transition-[box-shadow,background-color] duration-150 hover:bg-surface-2/80 " +
  "focus-visible:ring-2 focus-visible:ring-ai aria-invalid:ring-2 aria-invalid:ring-shu " +
  "disabled:opacity-50 motion-reduce:transition-none";

export const inputClass = `${control} min-h-11 px-3.5`;
export const textareaClass = `${control} min-h-24 px-3.5 py-2.5`;
// Le chevron vient de .field-select (globals.css) : une URL de données ne tient pas dans une classe arbitraire.
export const selectClass = `${control} field-select min-h-11 appearance-none pr-10 pl-3.5`;

export function TextInput({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${inputClass} ${className}`} {...props} />;
}

export function Textarea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${textareaClass} ${className}`} {...props} />;
}

export function Select({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${selectClass} ${className}`} {...props} />;
}

/** Champ avec icône de tête (recherche) : l'icône est décorative, le libellé reste sur l'input. */
export function IconInput({ icon, className = "", ...props }: InputHTMLAttributes<HTMLInputElement> & { icon: ReactNode }) {
  return (
    <span className={`relative flex min-w-0 items-center ${className}`}>
      <span aria-hidden="true" className="pointer-events-none absolute left-3.5 flex text-text-muted">
        {icon}
      </span>
      <input className={`${inputClass} pl-10`} {...props} />
    </span>
  );
}

export function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}
