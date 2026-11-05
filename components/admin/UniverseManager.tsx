"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition, type FormEvent } from "react";
import { cleanUniverseName, UNIVERSE_NAME_MAX } from "@/lib/catalog/universes";
import { adminSearchSeriesAction, type SeriesSearchHit } from "@/server/actions/admin-cosmetics";
import {
  adminAddSeriesToUniverseAction,
  adminCreateUniverseAction,
  adminDeleteUniverseAction,
  adminMergeUniversesAction,
  adminRemoveSeriesFromUniverseAction,
  adminRenameUniverseAction,
  type UniverseResult,
} from "@/server/actions/admin-universes";
import { Button } from "../ui/Button";
import { Sheet } from "../ui/Sheet";
import { Field, FormMessage, inputClass, selectClass } from "./fields";

export type UniverseRow = {
  id: string;
  name: string;
  series: { id: string; title: string; cards: number }[];
};

type Sheets = { kind: "RENAME" | "ADD" | "MERGE" | "DELETE"; universe: UniverseRow } | { kind: "CREATE" } | null;
type Message = { tone: "ok" | "error"; text: string } | null;
// Serveur injoignable : erreur affichée plutôt qu'un écran d'erreur
const UNAVAILABLE: UniverseResult = { ok: false, error: "UNEXPECTED" };

/** Univers de la page en cours : créer, renommer, ranger ou retirer des séries, fusionner, supprimer. */
export function UniverseManager({ universes, targets }: { universes: UniverseRow[]; targets: { id: string; name: string }[] }) {
  const t = useTranslations("admin.universes");
  const [sheet, setSheet] = useState<Sheets>(null);
  const [message, setMessage] = useState<Message>(null);
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<UniverseResult>, done: string) =>
    startTransition(async () => {
      setMessage(null);
      const res = await action().catch(() => UNAVAILABLE);
      if (!res.ok) {
        setMessage({ tone: "error", text: t(`errors.${res.error}`) });
        return;
      }
      setSheet(null);
      setMessage({ tone: "ok", text: done });
    });

  const open = (next: Sheets) => {
    setMessage(null);
    setSheet(next);
  };
  const inSheet = sheet ? message : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="primary" onClick={() => open({ kind: "CREATE" })}>
          {t("create")}
        </Button>
        {!sheet && <FormMessage message={message} />}
      </div>

      {universes.length === 0 ? (
        <p className="lacquer rounded-card p-4 text-center text-sm text-text-muted">{t("empty")}</p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {universes.map((universe) => (
            <li key={universe.id} className="flex min-w-0 flex-col gap-3 lacquer rounded-card p-4">
              <div>
                <h2 className="truncate font-title text-lg font-bold">{universe.name}</h2>
                <p className="text-xs tabular-nums text-text-muted">{t("seriesCount", { count: universe.series.length })}</p>
              </div>
              {universe.series.length > 0 && (
                <ul className="flex flex-col divide-y divide-border">
                  {universe.series.map((s) => (
                    <li key={s.id} className="flex min-h-11 items-center justify-between gap-2 py-1 text-sm">
                      <span className="min-w-0">
                        <span className="block truncate">{s.title}</span>
                        <span className="block text-xs tabular-nums text-text-muted">{t("cards", { count: s.cards })}</span>
                      </span>
                      {universe.series.length > 1 && (
                        <Button
                          disabled={pending}
                          aria-label={t("removeLabel", { series: s.title })}
                          onClick={() => run(() => adminRemoveSeriesFromUniverseAction({ universeId: universe.id, seriesId: s.id }), t("removed", { series: s.title }))}
                        >
                          {t("remove")}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => open({ kind: "ADD", universe })}>{t("add")}</Button>
                <Button onClick={() => open({ kind: "RENAME", universe })}>{t("rename")}</Button>
                <Button onClick={() => open({ kind: "MERGE", universe })}>{t("merge")}</Button>
                <Button variant="danger" onClick={() => open({ kind: "DELETE", universe })}>
                  {t("delete")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {sheet?.kind === "CREATE" && (
        <NameSheet
          title={t("create")}
          initial=""
          pending={pending}
          message={inSheet}
          onClose={() => setSheet(null)}
          onSave={(name) => run(() => adminCreateUniverseAction({ name }), t("created", { name }))}
        />
      )}
      {sheet?.kind === "RENAME" && (
        <NameSheet
          title={t("renameTitle", { name: sheet.universe.name })}
          initial={sheet.universe.name}
          pending={pending}
          message={inSheet}
          onClose={() => setSheet(null)}
          onSave={(name) => run(() => adminRenameUniverseAction({ universeId: sheet.universe.id, name }), t("renamed", { name }))}
        />
      )}
      {sheet?.kind === "ADD" && (
        <AddSeriesSheet
          universe={sheet.universe}
          pending={pending}
          message={inSheet}
          onClose={() => setSheet(null)}
          onPick={(series) => run(() => adminAddSeriesToUniverseAction({ universeId: sheet.universe.id, seriesId: series.id }), t("added", { series: series.title }))}
        />
      )}
      {sheet?.kind === "MERGE" && (
        <MergeSheet
          universe={sheet.universe}
          targets={targets.filter((u) => u.id !== sheet.universe.id)}
          pending={pending}
          message={inSheet}
          onClose={() => setSheet(null)}
          onMerge={(into) => run(() => adminMergeUniversesAction({ fromId: sheet.universe.id, intoId: into.id }), t("merged", { from: sheet.universe.name, into: into.name }))}
        />
      )}
      {sheet?.kind === "DELETE" && (
        <Sheet open onClose={() => setSheet(null)} title={t("deleteTitle", { name: sheet.universe.name })}>
          <p className="text-sm text-text-muted">{t("deleteText")}</p>
          <FormMessage message={inSheet} />
          <div className="grid grid-cols-2 gap-2">
            <Button disabled={pending} onClick={() => setSheet(null)}>
              {t("cancel")}
            </Button>
            <Button variant="danger" disabled={pending} onClick={() => run(() => adminDeleteUniverseAction({ universeId: sheet.universe.id }), t("deleted", { name: sheet.universe.name }))}>
              {t("delete")}
            </Button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function NameSheet({
  title,
  initial,
  pending,
  message,
  onClose,
  onSave,
}: {
  title: string;
  initial: string;
  pending: boolean;
  message: Message;
  onClose: () => void;
  onSave: (name: string) => void;
}) {
  const t = useTranslations("admin.universes");
  const [name, setName] = useState(initial);
  const clean = cleanUniverseName(name);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (clean && !pending) onSave(clean);
  };
  return (
    <Sheet open onClose={onClose} title={title}>
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <Field label={t("nameLabel")}>
          {(id) => <input id={id} value={name} onChange={(e) => setName(e.target.value)} maxLength={UNIVERSE_NAME_MAX} autoComplete="off" aria-invalid={!clean} className={inputClass} />}
        </Field>
        <FormMessage message={message} />
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" disabled={pending} onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button type="submit" variant="primary" disabled={!clean || pending}>
            {t("save")}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}

const MIN_SEARCH = 2;

/** Recherche d'une série par titre ; une série déjà rangée ailleurs le signale, car elle changera d'univers. */
function AddSeriesSheet({
  universe,
  pending,
  message,
  onClose,
  onPick,
}: {
  universe: UniverseRow;
  pending: boolean;
  message: Message;
  onClose: () => void;
  onPick: (series: SeriesSearchHit) => void;
}) {
  const t = useTranslations("admin.universes");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SeriesSearchHit[]>([]);
  const q = query.trim();

  useEffect(() => {
    if (q.length < MIN_SEARCH) return;
    let stale = false;
    const id = setTimeout(() => {
      void adminSearchSeriesAction(q).then((rows) => {
        if (!stale) setHits(rows);
      });
    }, 250);
    return () => {
      stale = true;
      clearTimeout(id);
    };
  }, [q]);

  const present = new Set(universe.series.map((s) => s.id));
  const shown = q.length < MIN_SEARCH ? [] : hits.filter((s) => !present.has(s.id));
  return (
    <Sheet open onClose={onClose} title={t("addTitle", { name: universe.name })}>
      <Field label={t("searchSeries")}>{(id) => <input id={id} type="search" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" className={inputClass} />}</Field>
      <FormMessage message={message} />
      {shown.length > 0 && (
        <ul className="flex flex-col divide-y divide-border">
          {shown.map((s) => (
            <li key={s.id} className="flex min-h-11 items-center justify-between gap-2 py-1 text-sm">
              <span className="min-w-0">
                <span className="block truncate">{s.title}</span>
                <span className="block text-xs text-text-muted">
                  {t("cards", { count: s.cards })}
                  {s.universe && ` · ${t("alreadyIn", { name: s.universe })}`}
                </span>
              </span>
              <Button disabled={pending} aria-label={t("addLabel", { series: s.title })} onClick={() => onPick(s)}>
                {t("addShort")}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

function MergeSheet({
  universe,
  targets,
  pending,
  message,
  onClose,
  onMerge,
}: {
  universe: UniverseRow;
  targets: { id: string; name: string }[];
  pending: boolean;
  message: Message;
  onClose: () => void;
  onMerge: (into: { id: string; name: string }) => void;
}) {
  const t = useTranslations("admin.universes");
  const [intoId, setIntoId] = useState("");
  const into = targets.find((u) => u.id === intoId);
  return (
    <Sheet open onClose={onClose} title={t("mergeTitle", { name: universe.name })}>
      <p className="text-sm text-text-muted">{t("mergeText", { name: universe.name })}</p>
      <Field label={t("mergeInto")}>
        {(id) => (
          <select id={id} value={intoId} onChange={(e) => setIntoId(e.target.value)} className={selectClass}>
            <option value="">{t("mergePick")}</option>
            {targets.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        )}
      </Field>
      <FormMessage message={message} />
      <div className="grid grid-cols-2 gap-2">
        <Button disabled={pending} onClick={onClose}>
          {t("cancel")}
        </Button>
        <Button variant="primary" disabled={!into || pending} onClick={() => into && onMerge(into)}>
          {t("merge")}
        </Button>
      </div>
    </Sheet>
  );
}
