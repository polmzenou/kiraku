"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { DEFAULT_LAYOUT, type ShowcaseLayoutId } from "@/lib/showcase/layouts";
import { SHOWCASE_NAME_MAX } from "@/lib/showcase/name";
import { DEFAULT_THEME, type ShowcaseThemeId, type ThemeChoice } from "@/lib/showcase/theme-registry";
import { createShowcaseAction, myThemeChoicesAction, type ShowcaseActionError } from "@/server/actions/showcases";
import { Button } from "../ui/Button";
import { Sheet } from "../ui/Sheet";
import { LayoutPicker } from "./LayoutPicker";
import { ThemePicker } from "./ThemePicker";
import "./showcase.css";

type Fill = "none" | "all" | "mythic";

/** Nouvelle vitrine : nom facultatif, disposition, thème, remplissage avec les meilleures cartes. */
function CreateShowcaseSheet({ username, count, max, onClose }: { username: string; count: number; max: number; onClose: () => void }) {
  const t = useTranslations("showcase");
  const router = useRouter();
  const nameId = useId();
  const [name, setName] = useState("");
  const [layout, setLayout] = useState<ShowcaseLayoutId>(DEFAULT_LAYOUT);
  const [theme, setTheme] = useState<ShowcaseThemeId>(DEFAULT_THEME);
  const [fill, setFill] = useState<Fill>("all");
  const [error, setError] = useState<ShowcaseActionError | null>(null);
  const [pending, startTransition] = useTransition();
  const full = count >= max;
  // Thèmes et progression du joueur, calculés à l'ouverture
  const [themes, setThemes] = useState<ThemeChoice[] | null>(null);
  useEffect(() => {
    void myThemeChoicesAction({}).then((res) => setThemes(res.ok ? res.themes : [{ id: DEFAULT_THEME, state: "available" }]));
  }, []);

  const submit = () =>
    startTransition(async () => {
      setError(null);
      const res = await createShowcaseAction({
        name,
        layout,
        theme,
        autofill: fill === "none" ? null : { series: null, minRarity: fill === "mythic" ? "MYTHIC" : null },
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`/u/${username}/vitrines/${res.id}?modifier=1`);
    });

  return (
    <Sheet open onClose={onClose} title={t("create.title")} wide>
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!full && !pending) submit();
        }}
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor={nameId} className="flex justify-between text-sm font-bold">
            <span>{t("create.name")}</span>
            <span className="font-normal tabular-nums text-text-muted">{t("create.nameCount", { count: [...name].length, max: SHOWCASE_NAME_MAX })}</span>
          </label>
          <input
            id={nameId}
            value={name}
            maxLength={SHOWCASE_NAME_MAX}
            autoComplete="off"
            onChange={(e) => setName(e.currentTarget.value)}
            placeholder={t("create.namePlaceholder")}
            className="min-h-11 rounded-control border border-border bg-surface px-3 text-text placeholder:text-text-muted"
          />
          <p className="text-xs text-text-muted">{t("create.nameHint")}</p>
        </div>

        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="mb-2 text-sm font-bold">{t("layoutTitle")}</legend>
          <LayoutPicker value={layout} onChange={setLayout} disabled={pending} />
        </fieldset>

        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="mb-2 text-sm font-bold">{t("themeTitle")}</legend>
          {themes ? <ThemePicker choices={themes} value={theme} onChange={setTheme} disabled={pending} /> : <p className="text-sm text-text-muted">{t("loading")}</p>}
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-bold">{t("create.autofill")}</legend>
          <div role="radiogroup" className="grid grid-cols-3 gap-2">
            {(["all", "mythic", "none"] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={fill === option}
                onClick={() => setFill(option)}
                className={`min-h-11 rounded-control border px-2 text-xs font-bold ${fill === option ? "border-shu bg-surface-2" : "border-border bg-surface"}`}
              >
                {t(`create.fill.${option}`)}
              </button>
            ))}
          </div>
          <p className="text-xs text-text-muted">{t("create.autofillHint")}</p>
        </fieldset>

        <div className="sticky bottom-0 -mx-1 flex flex-col gap-2 border-t border-border bg-surface px-1 pt-3">
          {error && (
            <p role="alert" className="text-sm text-shu">
              {t(`errors.${error}`)}
            </p>
          )}
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-text-muted">{full ? t("create.limitReached", { max }) : t("create.limit", { count, max })}</span>
            <Button type="submit" variant="primary" disabled={full || pending}>
              {pending ? t("create.creating") : t("create.submit")}
            </Button>
          </div>
        </div>
      </form>
    </Sheet>
  );
}

/** Bouton « Nouvelle vitrine » et sa feuille de création (propriétaire). */
export function CreateShowcaseButton({ compact = false, ...props }: { username: string; count: number; max: number; compact?: boolean }) {
  const t = useTranslations("showcase");
  const [open, setOpen] = useState(false);
  if (props.count >= props.max) return null;
  return (
    <>
      {compact ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-label={t("newShowcase")}
          className="mt-0.5 inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-control border border-dashed border-border px-3 text-sm font-bold text-text-muted"
        >
          <span aria-hidden="true">+</span>
          <span className="max-sm:sr-only">{t("newShowcase")}</span>
        </button>
      ) : (
        <Button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className="self-start">
          <span aria-hidden="true">+</span> {t("newShowcase")}
        </Button>
      )}
      {open && <CreateShowcaseSheet {...props} onClose={() => setOpen(false)} />}
    </>
  );
}
