"use client";

import { useTranslations } from "next-intl";
import { useCallback, useMemo, useState, useTransition, type SetStateAction } from "react";
import { useRouter } from "@/i18n/navigation";
import type { SettingKey } from "@/lib/settings/defaults";
import {
  commitSettingsEdits,
  editSettingsDraft,
  refreshedSettingsEdits,
  settingsDraftState,
  type SettingEdits,
  type SettingsOf,
  type SettingsSubmission,
} from "@/lib/settings/form";
import type { UpdateSettingsResult } from "@/server/actions/admin-settings";
import { Button } from "../ui/Button";

// Modifications en cours, et valeurs en vigueur (`initial`) au dernier enregistrement réussi tant que la page
// rafraîchie n'est pas arrivée
type DraftEdits<T> = { edits: SettingEdits; savedOver: T | null };
const liveEdits = <T,>(state: DraftEdits<T>, initial: T): SettingEdits =>
  state.savedOver !== null && state.savedOver !== initial ? refreshedSettingsEdits(state.edits) : state.edits;

/**
 * Brouillon d'un formulaire de réglages, à la place d'un useState(initial) (lib/settings/form.ts) : `base` garde, pour
 * chaque clé modifiée, la valeur en vigueur quand la modification a commencé ; les clés non modifiées suivent
 * `initial` quand la page se rafraîchit. Le formulaire compare `draft` à `base` (changedSettingKeys), les envoie tous
 * deux à son action et appelle `saved` après un enregistrement réussi (SettingsSaveBar le fait).
 */
export function useSettingsDraft<T extends Record<string, unknown>>(initial: T) {
  const [state, setState] = useState<DraftEdits<T>>({ edits: {}, savedOver: null });
  const edits = useMemo(() => liveEdits(state, initial), [state, initial]);
  const { draft, base } = useMemo(() => settingsDraftState(initial, edits), [initial, edits]);
  const setDraft = useCallback(
    (next: SetStateAction<T>) =>
      setState((s) => {
        const e = liveEdits(s, initial);
        const value = typeof next === "function" ? (next as (prev: T) => T)(settingsDraftState(initial, e).draft) : next;
        return { edits: editSettingsDraft(initial, e, value), savedOver: s.savedOver === initial ? s.savedOver : null };
      }),
    [initial],
  );
  const saved = useCallback(
    (sent: { base: Record<string, unknown>; draft: Record<string, unknown> }) =>
      setState((s) => ({ edits: commitSettingsEdits(liveEdits(s, initial), sent), savedOver: initial })),
    [initial],
  );
  return { draft, base, setDraft, saved };
}

/**
 * Barre d'enregistrement commune des nouveaux formulaires de réglages : liste des clés modifiées à
 * relire, confirmation, puis sauvegarde (une ligne AdminLog par clé côté serveur). Elle envoie la base
 * et le brouillon : le serveur n'écrit que les clés modifiées et refuse (STALE) si l'une d'elles a
 * changé en base depuis.
 */
export function SettingsSaveBar<K extends SettingKey>({
  valid,
  changedLabels,
  base,
  draft,
  save,
  saved,
}: {
  valid: boolean;
  /** Libellés des réglages modifiés par rapport à la base. */
  changedLabels: string[];
  /** Base et brouillon du formulaire (useSettingsDraft), envoyés tels quels à l'action. */
  base: SettingsOf<K>;
  draft: SettingsOf<K>;
  save: (submission: SettingsSubmission<K>) => Promise<UpdateSettingsResult>;
  /** `saved` de useSettingsDraft, appelé avec l'envoi après un enregistrement réussi. */
  saved: (sent: SettingsSubmission<K>) => void;
}) {
  const t = useTranslations("admin.settingsForm");
  const router = useRouter();
  const [reviewing, setReviewing] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const confirm = () =>
    startTransition(async () => {
      try {
        const sent = { base, draft };
        const res = await save(sent);
        setReviewing(false);
        if (!res.ok) setMessage({ ok: false, text: t(`errors.${res.error}`) });
        else {
          setMessage({ ok: true, text: t("saved", { count: res.changed.length }) });
          saved(sent);
          router.refresh();
        }
      } catch {
        setMessage({ ok: false, text: t("errors.unexpected") });
      }
    });

  return (
    <div className="flex flex-col gap-3">
      {!valid && (
        <p role="alert" className="text-sm text-shu">
          {t("invalid")}
        </p>
      )}
      {reviewing && valid && changedLabels.length > 0 ? (
        <section className="flex flex-col gap-3 rounded-card border border-shu bg-surface p-4" aria-live="polite">
          <h3 className="font-bold">{t("confirmTitle")}</h3>
          <ul className="list-inside list-disc text-sm">
            {changedLabels.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" onClick={() => setReviewing(false)} disabled={pending}>
              {t("cancel")}
            </Button>
            <Button type="button" variant="primary" onClick={confirm} disabled={pending}>
              {t("confirm")}
            </Button>
          </div>
        </section>
      ) : (
        <Button
          type="button"
          variant="primary"
          className="self-start"
          disabled={!valid || changedLabels.length === 0 || pending}
          onClick={() => {
            setMessage(null);
            setReviewing(true);
          }}
        >
          {changedLabels.length === 0 ? t("noChange") : t("review", { count: changedLabels.length })}
        </Button>
      )}
      {message && (
        <p role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-text-muted" : "text-shu"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
