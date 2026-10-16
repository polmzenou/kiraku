import type { ReactNode } from "react";

export type TableColumn<K extends string> = {
  key: K;
  label: string;
  /** Colonne mise en titre de la carte sur mobile (une seule). */
  primary?: boolean;
  /** Colonne d'actions : en bas de la carte sur mobile, sans libellé. */
  actions?: boolean;
  className?: string;
};

export type TableRow<K extends string> = { id: string; cells: Record<K, ReactNode> };

/**
 * Tableau dense de l'admin à partir de 768 px ; en dessous, chaque ligne devient une carte empilée
 * (titre, puis libellé : valeur, puis actions). Composant serveur, sans état.
 */
export function ResponsiveTable<K extends string>({
  columns,
  rows,
  caption,
}: {
  columns: readonly TableColumn<K>[];
  rows: readonly TableRow<K>[];
  caption?: string;
}) {
  const primary = columns.find((c) => c.primary);
  const fields = columns.filter((c) => !c.primary && !c.actions);
  const actions = columns.filter((c) => c.actions);

  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg border border-border bg-surface md:block">
        <table className="w-full text-left text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead className="border-b border-border bg-surface-2">
            <tr>
              {columns.map((c) => (
                <th key={c.key} scope="col" className="p-3 whitespace-nowrap">
                  {c.actions ? <span className="sr-only">{c.label}</span> : c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0">
                {columns.map((c) => (
                  <td key={c.key} className={`p-3 align-top ${c.className ?? ""}`}>
                    {r.cells[c.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col gap-2 md:hidden" aria-label={caption}>
        {rows.map((r) => (
          <li key={r.id} className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3 text-sm">
            {primary && <div className="min-w-0">{r.cells[primary.key]}</div>}
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              {fields.map((c) => (
                <div key={c.key} className="contents">
                  <dt className="text-text-muted">{c.label}</dt>
                  <dd className={`min-w-0 ${c.className ?? ""}`}>{r.cells[c.key]}</dd>
                </div>
              ))}
            </dl>
            {actions.map((c) => (
              <div key={c.key} className="flex flex-wrap gap-2">
                {r.cells[c.key]}
              </div>
            ))}
          </li>
        ))}
      </ul>
    </>
  );
}
