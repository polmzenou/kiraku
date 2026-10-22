import { useId } from "react";
import { NOTE_MAX_LENGTH } from "@/lib/text/plain";
import { textareaClass } from "./Field";

/** Commentaire facultatif (texte brut, 200 caractères) avec compteur ; nettoyé et revérifié par le serveur. */
export function NoteField({
  label,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <label htmlFor={id}>{label}</label>
        <span aria-hidden="true" className="text-xs tabular-nums text-text-muted">
          {value.length} / {NOTE_MAX_LENGTH}
        </span>
      </div>
      <textarea
        id={id}
        value={value}
        rows={2}
        maxLength={NOTE_MAX_LENGTH}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={`${textareaClass} min-h-16 text-sm`}
      />
    </div>
  );
}
