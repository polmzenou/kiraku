"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { CARD_IMAGE_TYPES } from "@/lib/catalog/media";
import { frescoInputSchema, type FrescoInput, type FrescoStatus } from "@/lib/fresco/admin";
import { cropAxis, cellCount } from "@/lib/fresco/grid";
import type { LotView } from "@/server/economy/lot-view";
import { deleteFrescoAction, saveFrescoAction, setFrescoStatusAction, type AdminFrescoError } from "@/server/actions/admin-fresco";
import type { FrescoEditorOptions } from "@/server/fresco/admin-queries";
import { Button } from "../../ui/Button";
import { NumberField, SelectField, TextField, Toggle } from "../fields";
import { cutLocally, LocalCutError, releaseLocal, type LocalFresco } from "./cut-client";
import { FrescoPreview } from "./FrescoPreview";

export type FrescoEditorDetail = {
  id: string;
  status: FrescoStatus;
  publishedAt: string | null;
  cols: number;
  rows: number;
  imageUrl: string | null;
  teaserUrl: string | null;
  pieces: { position: number; imageUrl: string }[];
  input: FrescoInput;
  owners: number;
};

type LotKey = keyof FrescoInput["lots"];
const LOT_KEYS: LotKey[] = ["piece", "row", "column", "complete"];
type Confirming = "publish" | "archive" | "delete" | null;

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
      <h3 className="font-title text-lg font-bold">{title}</h3>
      {hint && <p className="-mt-2 text-xs text-text-muted">{hint}</p>}
      {children}
    </section>
  );
}

/**
 * Éditeur d'une fresque : image déposée et découpée sur place (aperçu immédiat, cadrage), nom, chute, lots et
 * spoiler, avec l'aperçu en direct des écrans des joueurs à côté. L'image ne change plus après publication.
 */
export function FrescoEditor({
  detail,
  options,
  lotViews,
  storageConfigured,
}: {
  detail: FrescoEditorDetail;
  options: FrescoEditorOptions;
  lotViews: Record<string, LotView>;
  storageConfigured: boolean;
}) {
  const t = useTranslations("admin.frescoes.editor");
  const tStatus = useTranslations("admin.frescoes.status");
  const tPreview = useTranslations("admin.frescoes.preview");
  const locale = useLocale();
  const router = useRouter();
  const [draft, setDraft] = useState<FrescoInput>(detail.input);
  const [baseline, setBaseline] = useState(JSON.stringify(detail.input));
  const [file, setFile] = useState<File | null>(null);
  const [focus, setFocus] = useState(0.5);
  const [local, setLocal] = useState<LocalFresco | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const draftImage = detail.status === "DRAFT";
  const dirty = JSON.stringify(draft) !== baseline;
  const valid = frescoInputSchema.safeParse(draft).success;
  const name = draft.name.fr || "—";

  // Découpe locale à chaque fichier ou cadrage (un court délai pendant qu'on fait glisser le curseur)
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      cutLocally(file, focus)
        .then((cut) => {
          if (cancelled) return releaseLocal(cut);
          setLocal((prev) => {
            releaseLocal(prev);
            return cut;
          });
          setMessage(null);
        })
        .catch((e) => !cancelled && setMessage({ tone: "error", text: t(`errors.${e instanceof LocalCutError ? e.code : "IMAGE_INVALID"}`) }));
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [file, focus, t]);
  useEffect(() => () => setLocal((prev) => (releaseLocal(prev), null)), []);

  const errorText = (code: AdminFrescoError | string) => (t.has(`errors.${code}` as "errors.UNAVAILABLE") ? t(`errors.${code}` as "errors.UNAVAILABLE") : t("errors.UNAVAILABLE"));
  const update = (patch: Partial<FrescoInput>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setMessage(null);
  };
  const selectFile = (value: File | undefined) => {
    if (!value) return;
    if (!CARD_IMAGE_TYPES.includes(value.type)) return setMessage({ tone: "error", text: t("errors.IMAGE_INVALID") });
    setFocus(0.5);
    setFile(value);
  };

  const save = () =>
    startTransition(async () => {
      const res = await saveFrescoAction({ id: detail.id, fresco: draft }).catch(() => ({ ok: false as const, error: "UNAVAILABLE" as const }));
      if (!res.ok) return setMessage({ tone: "error", text: errorText(res.error) });
      setBaseline(JSON.stringify(draft));
      setMessage({ tone: "ok", text: t("saved") });
      router.refresh();
    });

  const upload = () => {
    if (!local) return;
    setUploading(true);
    startTransition(async () => {
      try {
        const data = new FormData();
        data.set("file", local.upload);
        const response = await fetch(`/api/admin/fresques/upload?fresque=${encodeURIComponent(detail.id)}`, { method: "POST", body: data });
        const result = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!response.ok || !result.ok) return setMessage({ tone: "error", text: errorText(result.error ?? "UPLOAD_FAILED") });
        setFile(null);
        setLocal((prev) => (releaseLocal(prev), null));
        setMessage({ tone: "ok", text: t("uploaded", { count: cellCount(detail) }) });
        router.refresh();
      } catch {
        setMessage({ tone: "error", text: t("errors.UPLOAD_FAILED") });
      } finally {
        setUploading(false);
      }
    });
  };

  const act = (kind: Exclude<Confirming, null>) =>
    startTransition(async () => {
      setConfirming(null);
      const res =
        kind === "delete"
          ? await deleteFrescoAction({ id: detail.id }).catch(() => ({ ok: false as const, error: "UNAVAILABLE" as const }))
          : await setFrescoStatusAction({ id: detail.id, status: kind === "publish" ? "PUBLISHED" : "ARCHIVED" }).catch(() => ({ ok: false as const, error: "UNAVAILABLE" as const }));
      if (!res.ok) return setMessage({ tone: "error", text: errorText(res.error) });
      if (kind === "delete") router.push("/admin/fresques");
      else router.refresh();
    });

  const lotOptions = [{ value: "", label: t("noLot") }, ...options.lots.map((l) => ({ value: l.id, label: l.active ? l.name : `${l.name} ${t("lotInactive")}` }))];
  const preview = local
    ? { name, cols: detail.cols, rows: detail.rows, pieces: local.pieces, fullImageUrl: local.fullUrl, teaserUrl: local.teaserUrl, spoiler: draft.spoiler }
    : detail.imageUrl
      ? { name, cols: detail.cols, rows: detail.rows, pieces: detail.pieces, fullImageUrl: detail.imageUrl, teaserUrl: detail.teaserUrl, spoiler: draft.spoiler }
      : null;
  const boosterNames = draft.boosterTypeIds.length === 0 ? null : options.boosters.filter((b) => draft.boosterTypeIds.includes(b.id)).map((b) => b.name);
  const axis = local ? cropAxis(local.source.width, local.source.height, detail) : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Link href="/admin/fresques" className="text-sm text-link underline">
            ← {t("back")}
          </Link>
          <h2 className="flex items-center gap-2 font-heading text-2xl font-bold">
            <span aria-hidden="true" lang="ja" className="font-seal text-kin">
              絵
            </span>
            {name}
            <span className="rounded-pill border border-border px-2 py-0.5 text-xs font-bold">{tStatus(detail.status)}</span>
          </h2>
          <p className="text-xs text-text-muted">{t("owners", { count: detail.owners })}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {detail.status !== "PUBLISHED" && (
            <Button type="button" variant="primary" disabled={pending || dirty} onClick={() => setConfirming("publish")}>
              {detail.status === "ARCHIVED" ? t("republish") : t("publish")}
            </Button>
          )}
          {detail.status === "PUBLISHED" && (
            <Button type="button" disabled={pending} onClick={() => setConfirming("archive")}>
              {t("archive")}
            </Button>
          )}
          {detail.status === "DRAFT" && (
            <Button type="button" className="text-shu" disabled={pending} onClick={() => setConfirming("delete")}>
              {t("delete")}
            </Button>
          )}
        </div>
      </div>

      {confirming && (
        <div role="alertdialog" aria-label={t(confirming)} className="flex flex-col gap-3 rounded-card border border-kin bg-surface p-4">
          <p className="text-sm">{t(`${confirming}Confirm`, { name })}</p>
          <div className="flex gap-2">
            <Button type="button" variant="primary" onClick={() => act(confirming)} disabled={pending}>
              {t("confirm")}
            </Button>
            <Button type="button" onClick={() => setConfirming(null)}>
              {t("cancel")}
            </Button>
          </div>
        </div>
      )}

      {message && (
        <p role={message.tone === "error" ? "alert" : "status"} className={`text-sm ${message.tone === "error" ? "text-shu" : "text-kin"}`}>
          {message.text}
        </p>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] xl:items-start">
        <div className="flex flex-col gap-4">
          <Section title={t("imageSection")} hint={draftImage ? t("imageHint") : undefined}>
            {!draftImage ? (
              <p className="text-sm text-text-muted">{t("lockedImage")}</p>
            ) : (
              <>
                {!storageConfigured && <p className="text-sm text-shu">{t("storageSetup")}</p>}
                <div
                  className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-control border-2 border-dashed border-border bg-surface-2 p-4 text-center"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    selectFile(e.dataTransfer.files[0]);
                  }}
                >
                  <span className="font-bold">{file?.name ?? t("drop")}</span>
                  <Button type="button" size="sm" onClick={() => input.current?.click()}>
                    {t("choose")}
                  </Button>
                  <input ref={input} type="file" accept={CARD_IMAGE_TYPES.join(",")} className="sr-only" tabIndex={-1} onChange={(e) => selectFile(e.target.files?.[0])} />
                </div>
                {local && axis && (
                  <label className="flex flex-col gap-1 text-sm">
                    {t("focus")}
                    <input type="range" min={0} max={1} step={0.01} value={focus} onChange={(e) => setFocus(e.target.valueAsNumber)} className="min-h-11" />
                    <span className="text-xs text-text-muted">{t("focusHint")}</span>
                  </label>
                )}
                {local && (
                  <>
                    <p className="text-xs text-text-muted">{t("localNote")}</p>
                    <Button type="button" variant="primary" className="self-start" disabled={pending || uploading || !storageConfigured} onClick={upload}>
                      {uploading ? t("uploading") : t("upload")}
                    </Button>
                  </>
                )}
              </>
            )}
          </Section>

          <Section title={t("nameSection")}>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label={t("nameFr")} value={draft.name.fr} maxLength={60} invalid={!draft.name.fr.trim()} onChange={(fr) => update({ name: { ...draft.name, fr } })} />
              <TextField label={t("nameEn")} value={draft.name.en ?? ""} maxLength={60} onChange={(en) => update({ name: { ...draft.name, en } })} />
            </div>
          </Section>

          <Section title={t("lotsSection")} hint={t("lotsHint")}>
            <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
              {LOT_KEYS.map((key) => (
                <SelectField
                  key={key}
                  label={t(`lots.${key}`)}
                  value={draft.lots[key] ?? ""}
                  options={lotOptions}
                  onChange={(v) => update({ lots: { ...draft.lots, [key]: v || null } })}
                />
              ))}
            </div>
            <Link href="/admin/lots" className="self-start text-sm text-link underline">
              {t("manageLots")}
            </Link>
          </Section>

          <Section title={t("dropSection")}>
            <NumberField label={t("weight")} hint={t("weightHint")} value={draft.dropWeight} min={0} max={1_000} onChange={(dropWeight) => update({ dropWeight })} />
            <fieldset className="flex flex-col gap-1">
              <legend className="mb-1 text-sm font-bold">{t("boosters")}</legend>
              <p className="text-xs text-text-muted">{t("boostersHint")}</p>
              <div className="grid max-h-64 gap-x-3 overflow-y-auto sm:grid-cols-2">
                {options.boosters.map((b) => (
                  <label key={b.id} className="flex min-h-11 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="choice"
                      checked={draft.boosterTypeIds.includes(b.id)}
                      onChange={(e) => update({ boosterTypeIds: e.target.checked ? [...draft.boosterTypeIds, b.id] : draft.boosterTypeIds.filter((id) => id !== b.id) })}
                    />
                    {b.name}
                    {!b.active && <span className="text-xs text-text-muted">({t("inactive")})</span>}
                  </label>
                ))}
              </div>
            </fieldset>
          </Section>

          <Section title={t("spoilerSection")}>
            <SelectField
              label={t("universe")}
              value={draft.universeId ?? ""}
              options={[{ value: "", label: t("noUniverse") }, ...options.universes.map((u) => ({ value: u.id, label: u.name }))]}
              onChange={(v) => update({ universeId: v || null })}
            />
            <Toggle label={t("spoiler")} checked={draft.spoiler} onChange={(spoiler) => update({ spoiler })} />
          </Section>

          <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface p-3 shadow-lg">
            <Button type="button" variant="primary" disabled={!dirty || !valid || pending} onClick={save}>
              {t("save")}
            </Button>
            {dirty && <span className="text-xs text-kin">{t("unsaved")}</span>}
          </div>
        </div>

        <div className="flex flex-col gap-3 xl:sticky xl:top-20">
          <div className="flex flex-col gap-1">
            <h3 className="font-title text-lg font-bold">{tPreview("title")}</h3>
            <p className="text-xs text-text-muted">{tPreview("intro")}</p>
          </div>
          <FrescoPreview
            key={locale}
            source={preview}
            lots={Object.fromEntries(LOT_KEYS.map((k) => [k, draft.lots[k] ? (lotViews[draft.lots[k]!] ?? null) : null])) as Record<LotKey, LotView | null>}
            boosters={boosterNames}
            publishedAt={detail.publishedAt}
          />
        </div>
      </div>
    </div>
  );
}
