import { useTranslations } from "next-intl";
import { Hanko } from "./Hanko";

/** Les trois règles du pile ou face, chacune avec son sceau. */
export function CasinoRules({ className = "" }: { className?: string }) {
  const t = useTranslations("casino.rules");
  const rules = [
    { glyph: "札", text: t("stake") },
    { glyph: "対", text: t("tier") },
    { glyph: "勝", text: t("winner") },
  ];
  return (
    <ul aria-label={t("label")} className={`flex flex-col gap-2 text-sm ${className}`}>
      {rules.map((r) => (
        <li key={r.glyph} className="flex items-center gap-2.5">
          <Hanko glyph={r.glyph} size={26} />
          <span>{r.text}</span>
        </li>
      ))}
    </ul>
  );
}
