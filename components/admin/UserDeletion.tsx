"use client";

import { useTranslations } from "next-intl";
import { createContext, use, useId, useState, type ReactNode } from "react";
import { useRouter } from "@/i18n/navigation";
import { adminDeleteUsersAction, type DeleteUsersResult } from "@/server/actions/admin-users";
import { ConfirmAction } from "./ConfirmAction";
import { textareaClass } from "../ui/Field";

type Selectable = { id: string; username: string };

const SelectionContext = createContext<{ selected: Set<string>; toggle: (id: string) => void } | null>(null);

/** Message d'échec traduit d'une suppression, ou null si tous les comptes sont partis. */
function useDeleteOutcome() {
  const t = useTranslations("admin.users.deletion");
  return (res: DeleteUsersResult): string | null => {
    if (!res.ok) return t(`errors.${res.error}`);
    if (res.failed.length === 0) return null;
    const reasons = [...new Set(res.failed.map((f) => t(`errors.${f.error}`)))].join(" ");
    return t("partial", { deleted: res.deleted.length, failed: res.failed.length, reasons });
  };
}

function ReasonField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useTranslations("admin.users.deletion");
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm">
        {t("reason")}
      </label>
      <textarea id={id} value={value} maxLength={300} rows={2} onChange={(e) => onChange(e.target.value)} className={textareaClass} />
    </div>
  );
}

/**
 * Sélection multiple de la liste des joueurs : une case par ligne (`UserSelectCheckbox`), une barre
 * « N sélectionnés · Supprimer » au-dessus du tableau. Les admins ne sont pas sélectionnables.
 */
export function UserSelection({ selectable, children }: { selectable: Selectable[]; children: ReactNode }) {
  const t = useTranslations("admin.users.deletion");
  const router = useRouter();
  const outcome = useDeleteOutcome();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState("");
  const allId = useId();
  const allSelected = selectable.length > 0 && selectable.every((u) => selected.has(u.id));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const names = selectable.filter((u) => selected.has(u.id)).map((u) => u.username);

  return (
    <SelectionContext value={{ selected, toggle }}>
      <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-10 flex flex-wrap items-center justify-between gap-3 lacquer rounded-card px-3 py-2 md:top-[calc(4rem+env(safe-area-inset-top))]">
        <label htmlFor={allId} className="flex min-h-11 items-center gap-3 text-sm">
          <input
            id={allId}
            type="checkbox"
            className="choice"
            checked={allSelected}
            disabled={selectable.length === 0}
            onChange={() => setSelected(allSelected ? new Set() : new Set(selectable.map((u) => u.id)))}
          />
          {t("selectPage")}
        </label>
        <div className="flex items-center gap-3">
          <span className="text-sm tabular-nums text-text-muted">{t("selected", { count: selected.size })}</span>
          {selected.size > 0 && (
            <ConfirmAction
              label={t("deleteSelected", { count: selected.size })}
              title={t("title", { count: selected.size })}
              description={
                <>
                  <p>{t("description")}</p>
                  <p className="break-words font-bold">{names.join(", ")}</p>
                </>
              }
              confirmLabel={t("confirm")}
              typeToConfirm={t("word")}
              variant="danger"
              onConfirm={async (typed) => {
                const res = await adminDeleteUsersAction({ ids: [...selected], reason: reason.trim() || t("defaultReason"), confirm: typed.toUpperCase() });
                if (res.ok) {
                  setSelected(new Set(res.failed.map((f) => f.id)));
                  router.refresh();
                }
                return outcome(res);
              }}
            >
              <ReasonField value={reason} onChange={setReason} />
            </ConfirmAction>
          )}
        </div>
      </div>
      {children}
    </SelectionContext>
  );
}

/** Case d'une ligne ; désactivée (et absente de la sélection) pour un admin. */
export function UserSelectCheckbox({ id, username, disabled = false }: { id: string; username: string; disabled?: boolean }) {
  const t = useTranslations("admin.users.deletion");
  const ctx = use(SelectionContext);
  if (!ctx) return null;
  return (
    <input
      type="checkbox"
      className="choice shrink-0"
      aria-label={t("selectOne", { name: username })}
      checked={ctx.selected.has(id)}
      disabled={disabled}
      onChange={() => ctx.toggle(id)}
    />
  );
}

/** Suppression depuis la fiche d'un joueur ; retour à la liste une fois le compte supprimé. */
export function DeleteUserButton({ id, username }: { id: string; username: string }) {
  const t = useTranslations("admin.users.deletion");
  const router = useRouter();
  const outcome = useDeleteOutcome();
  const [reason, setReason] = useState("");
  return (
    <ConfirmAction
      label={t("deleteOne")}
      title={t("title", { count: 1 })}
      description={
        <>
          <p>{t("description")}</p>
          <p className="font-bold">{username}</p>
        </>
      }
      confirmLabel={t("confirm")}
      typeToConfirm={t("word")}
      variant="danger"
      onConfirm={async (typed) => {
        const res = await adminDeleteUsersAction({ ids: [id], reason: reason.trim() || t("defaultReason"), confirm: typed.toUpperCase() });
        const message = outcome(res);
        if (!message) router.replace("/admin/utilisateurs");
        return message;
      }}
    >
      <ReasonField value={reason} onChange={setReason} />
    </ConfirmAction>
  );
}
