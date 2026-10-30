"use client";

import { useRarities, useRaritySeals } from "@/lib/catalog/use-rarities";

import { useTranslations } from "next-intl";
import Image from "next/image";
import { useEffect, useId, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "@/i18n/navigation";
import type { BoosterTypeForm as FormValues } from "@/lib/boosters/admin-form";
import { contentsLabel } from "@/lib/boosters/catalog";
import { BOOSTER_FAMILIES, BOOSTER_SHAPES, WAGARA } from "@/lib/boosters/types";
import { type Rarity } from "@/lib/catalog/rarity";
import { MAX_FOCUS_SERIES } from "@/lib/boosters/admin-form";
import {
  saveBoosterType,
  searchFeaturedCards,
  searchFocusSeries,
  type FeaturedCandidate,
  type FocusSeriesCandidate,
} from "@/server/actions/admin-boosters";
import { BoosterArt } from "../boosters/BoosterArt";
import { Button } from "../ui/Button";

const input =
  "min-h-11 w-full min-w-0 rounded-control border border-border bg-surface-2 px-3 text-base aria-invalid:border-shu";

const list = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

const numOrNull = (s: string) => (s.trim() === "" || !Number.isFinite(Number(s)) ? null : Math.trunc(Number(s)));

/** Date ISO → valeur d'un champ datetime-local (heure locale du navigateur). */
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function Field({ label, hint, children }: { label: string; hint?: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-sm">
        {label}
      </label>
      {children(id)}
      {hint && <span className="text-xs text-text-muted">{hint}</span>}
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-11 items-center gap-3 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-5 accent-[var(--color-shu-btn)]" />
      {label}
    </label>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4 lacquer rounded-card p-4">
      <legend className="px-1 font-title text-lg font-bold">{title}</legend>
      {children}
    </fieldset>
  );
}

type Props = {
  initial: FormValues;
  /** Vedettes déjà choisies (affichage). */
  featured: FeaturedCandidate[];
  /** Focus série : œuvres déjà choisies (affichage). */
  focusSeries?: FocusSeriesCandidate[];
  /** Nombre de cartes de la composition globale. */
  globalCards: number;
};

/** Création ou modification d'un type de booster (ou d'une bannière vedette), avec aperçu du sachet. */
export function BoosterTypeForm({ initial, featured: initialFeatured, focusSeries: initialFocus = [], globalCards }: Props) {
  const RARITIES = useRarities();
  const RARITY_SEAL = useRaritySeals();
  const t = useTranslations("admin.form");
  const tFamilies = useTranslations("boosters.families");
  const tRarity = useTranslations("rarity");
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [tags, setTags] = useState((initial.filter.tags ?? []).join(", "));
  const [genres, setGenres] = useState((initial.filter.genres ?? []).join(", "));
  const [seriesIds, setSeriesIds] = useState((initial.filter.seriesIds ?? []).join(", "));
  const [anilistIds, setAnilistIds] = useState((initial.filter.anilistIds ?? []).join(", "));
  const [ownFloors, setOwnFloors] = useState(initial.slotFloors.length > 0);
  const [featured, setFeatured] = useState(initialFeatured);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FeaturedCandidate[]>([]);
  const [focus, setFocus] = useState(initialFocus);
  const [seriesQuery, setSeriesQuery] = useState("");
  const [seriesResults, setSeriesResults] = useState<FocusSeriesCandidate[]>([]);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => setV((s) => ({ ...s, [key]: value }));
  const setFilter = (patch: Partial<FormValues["filter"]>) => setV((s) => ({ ...s, filter: { ...s.filter, ...patch } }));
  const isFocus = v.kind === "FOCUS";
  const isBanner = !isFocus && (v.kind === "BANNER" || featured.length > 0);

  // Recherche des vedettes (délai pour ne pas appeler le serveur à chaque touche)
  useEffect(() => {
    if (query.trim().length < 2) return;
    const id = setTimeout(async () => setResults(await searchFeaturedCards(query)), 300);
    return () => clearTimeout(id);
  }, [query]);

  // Recherche des œuvres d'un Focus série
  useEffect(() => {
    if (seriesQuery.trim().length < 2) return;
    const id = setTimeout(async () => setSeriesResults(await searchFocusSeries(seriesQuery)), 300);
    return () => clearTimeout(id);
  }, [seriesQuery]);

  const submit = () =>
    start(async () => {
      setMessage(null);
      const payload: FormValues = {
        ...v,
        slotFloors: ownFloors ? v.slotFloors : [],
        featuredCardIds: featured.map((c) => c.id),
        focusSeriesIds: isFocus ? focus.map((s) => s.anilistId) : [],
        filter: {
          ...v.filter,
          tags: list(tags),
          genres: list(genres),
          seriesIds: list(seriesIds)
            .map(Number)
            .filter((n) => Number.isInteger(n) && n > 0),
          anilistIds: list(anilistIds).map(Number).filter((n) => Number.isInteger(n) && n > 0),
        },
      };
      try {
        const res = await saveBoosterType(payload);
        if (res.ok) {
          setMessage({ ok: true, text: t("saved", { count: res.poolSize }) });
          if (v.mode === "create") router.push(`/admin/boosters/types/${v.slug}`);
          else router.refresh();
        } else {
          setMessage({ ok: false, text: t(`errors.${res.error}`, { count: res.poolSize ?? 0 }) });
        }
      } catch {
        setMessage({ ok: false, text: t("errors.unexpected") });
      }
    });

  const floors = ownFloors ? v.slotFloors : [];

  // Taux et pitié des vedettes : bannière ou Focus série (mêmes champs, libellés différents)
  const rateFields = (rateLabel: string, pityLabel: string) => (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={rateLabel}>
        {(id) => (
          <input
            id={id}
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            step={1}
            className={input}
            value={v.featuredRate / 100}
            onChange={(e) => set("featuredRate", Math.round(Math.min(100, Math.max(0, Number(e.target.value) || 0)) * 100))}
          />
        )}
      </Field>
      <Field label={pityLabel}>
        {(id) => (
          <input id={id} type="number" inputMode="numeric" min={0} className={input} value={v.featuredPity} onChange={(e) => set("featuredPity", numOrNull(e.target.value) ?? 0)} />
        )}
      </Field>
    </div>
  );

  return (
    <form
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-start"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex min-w-0 flex-col gap-6">
        <Section title={t("identity")}>
          {v.mode === "create" && (
            <Field label={t("slug")} hint={t("slugHint")}>
              {(id) => <input id={id} className={input} value={v.slug} onChange={(e) => set("slug", e.target.value.toLowerCase())} />}
            </Field>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("nameFr")}>
              {(id) => <input id={id} className={input} maxLength={80} value={v.name.fr} onChange={(e) => set("name", { ...v.name, fr: e.target.value })} />}
            </Field>
            <Field label={t("nameEn")}>
              {(id) => <input id={id} className={input} maxLength={80} value={v.name.en} onChange={(e) => set("name", { ...v.name, en: e.target.value })} />}
            </Field>
            <Field label={t("taglineFr")}>
              {(id) => (
                <input id={id} className={input} maxLength={80} value={v.tagline.fr} onChange={(e) => set("tagline", { ...v.tagline, fr: e.target.value })} />
              )}
            </Field>
            <Field label={t("taglineEn")}>
              {(id) => (
                <input id={id} className={input} maxLength={80} value={v.tagline.en} onChange={(e) => set("tagline", { ...v.tagline, en: e.target.value })} />
              )}
            </Field>
            <Field label={t("emblem")} hint={t("emblemHint")}>
              {(id) => <input id={id} lang="ja" className={input} maxLength={2} value={v.emblem} onChange={(e) => set("emblem", e.target.value)} />}
            </Field>
            <Field label={t("family")}>
              {(id) => (
                <select id={id} className={input} value={v.family} onChange={(e) => set("family", e.target.value as FormValues["family"])}>
                  {BOOSTER_FAMILIES.map((f) => (
                    <option key={f} value={f}>
                      {tFamilies(`${f}.title`)}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>
        </Section>

        <Section title={t("appearance")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("shape")}>
              {(id) => (
                <select id={id} className={input} value={v.shape} onChange={(e) => set("shape", e.target.value as FormValues["shape"])}>
                  {BOOSTER_SHAPES.map((s) => (
                    <option key={s} value={s}>
                      {t(`shapes.${s}`)}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label={t("pattern")}>
              {(id) => (
                <select id={id} className={input} value={v.theme.pattern} onChange={(e) => set("theme", { ...v.theme, pattern: e.target.value as FormValues["theme"]["pattern"] })}>
                  {WAGARA.map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label={t("base")}>
              {(id) => <input id={id} type="color" className={`${input} p-1`} value={v.theme.base} onChange={(e) => set("theme", { ...v.theme, base: e.target.value })} />}
            </Field>
            <Field label={t("dark")}>
              {(id) => <input id={id} type="color" className={`${input} p-1`} value={v.theme.dark} onChange={(e) => set("theme", { ...v.theme, dark: e.target.value })} />}
            </Field>
            <Field label={t("ink")}>
              {(id) => (
                <select id={id} className={input} value={v.theme.ink} onChange={(e) => set("theme", { ...v.theme, ink: e.target.value as "light" | "dark" })}>
                  <option value="light">{t("inks.light")}</option>
                  <option value="dark">{t("inks.dark")}</option>
                </select>
              )}
            </Field>
          </div>
        </Section>

        <Section title={t("pool")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("tags")}>{(id) => <input id={id} className={input} value={tags} onChange={(e) => setTags(e.target.value)} />}</Field>
            <Field label={t("genres")}>{(id) => <input id={id} className={input} value={genres} onChange={(e) => setGenres(e.target.value)} />}</Field>
            <Field label={t("gender")}>
              {(id) => (
                <select id={id} className={input} value={v.filter.gender ?? ""} onChange={(e) => setFilter({ gender: (e.target.value || undefined) as "Female" | "Male" | undefined })}>
                  <option value="">{t("any")}</option>
                  <option value="Female">{t("female")}</option>
                  <option value="Male">{t("male")}</option>
                </select>
              )}
            </Field>
            <Field label={t("role")}>
              {(id) => (
                <select id={id} className={input} value={v.filter.role ?? ""} onChange={(e) => setFilter({ role: (e.target.value || undefined) as "MAIN" | "SUPPORTING" | undefined })}>
                  <option value="">{t("any")}</option>
                  <option value="MAIN">{t("main")}</option>
                  <option value="SUPPORTING">{t("supporting")}</option>
                </select>
              )}
            </Field>
            <Field label={t("yearMin")}>
              {(id) => (
                <input id={id} type="number" inputMode="numeric" className={input} value={v.filter.yearMin ?? ""} onChange={(e) => setFilter({ yearMin: numOrNull(e.target.value) ?? undefined })} />
              )}
            </Field>
            <Field label={t("yearMax")}>
              {(id) => (
                <input id={id} type="number" inputMode="numeric" className={input} value={v.filter.yearMax ?? ""} onChange={(e) => setFilter({ yearMax: numOrNull(e.target.value) ?? undefined })} />
              )}
            </Field>
            <Field label={t("studio")}>
              {(id) => <input id={id} className={input} maxLength={100} value={v.filter.studio ?? ""} onChange={(e) => setFilter({ studio: e.target.value || undefined })} />}
            </Field>
            <Field label={t("mediaType")}>
              {(id) => (
                <select id={id} className={input} value={v.filter.mediaType ?? ""} onChange={(e) => setFilter({ mediaType: (e.target.value || undefined) as "ANIME" | "MANGA" | undefined })}>
                  <option value="">{t("any")}</option>
                  <option value="ANIME">{t("anime")}</option>
                  <option value="MANGA">{t("manga")}</option>
                </select>
              )}
            </Field>
            <Field label={t("seriesIds")}>{(id) => <input id={id} className={input} value={seriesIds} onChange={(e) => setSeriesIds(e.target.value)} />}</Field>
            <Field label={t("anilistIds")} hint={t("anilistIdsHint")}>{(id) => <input id={id} className={input} value={anilistIds} onChange={(e) => setAnilistIds(e.target.value)} />}</Field>
            <Field label={t("minPoolSize")}>
              {(id) => <input id={id} type="number" inputMode="numeric" className={input} value={v.minPoolSize ?? ""} onChange={(e) => set("minPoolSize", numOrNull(e.target.value))} />}
            </Field>
          </div>
          <div className="flex flex-wrap gap-x-6">
            <Check label={t("currentSeason")} checked={Boolean(v.filter.currentSeason)} onChange={(c) => setFilter({ currentSeason: c || undefined })} />
            <Check label={t("birthdayToday")} checked={Boolean(v.filter.birthdayToday)} onChange={(c) => setFilter({ birthdayToday: c || undefined })} />
          </div>
        </Section>

        <Section title={t("composition")}>
          <Check label={t("useOwnFloors")} checked={ownFloors} onChange={setOwnFloors} />
          {!ownFloors ? (
            <p className="text-sm text-text-muted">{t("slotFloorsGlobal", { count: globalCards })}</p>
          ) : (
            <div className="flex flex-col gap-2">
              <span className="text-sm">{t("slotFloors")}</span>
              <ol className="flex flex-wrap gap-2">
                {floors.map((floor, i) => (
                  <li key={i} className="flex items-center gap-1">
                    <select
                      aria-label={t("slot", { n: i + 1 })}
                      className={`${input} w-auto`}
                      value={floor}
                      onChange={(e) => set("slotFloors", floors.map((f, j) => (j === i ? (e.target.value as Rarity) : f)))}
                    >
                      {RARITIES.map((r) => (
                        <option key={r} value={r}>
                          {RARITY_SEAL[r]} {tRarity(r)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      aria-label={t("removeSlot", { n: i + 1 })}
                      onClick={() => set("slotFloors", floors.filter((_, j) => j !== i))}
                      className="inline-flex size-11 items-center justify-center rounded-control text-xl"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ol>
              {floors.length < 20 && (
                <Button type="button" className="self-start" onClick={() => set("slotFloors", [...floors, "COMMON"])}>
                  {t("addSlot")}
                </Button>
              )}
            </div>
          )}
        </Section>

        <Section title={t("priceBonus")}>
          <Check label={t("usesFreeStock")} checked={v.usesFreeStock} onChange={(c) => set("usesFreeStock", c)} />
          <Field label={t("priceZeni")} hint={v.usesFreeStock ? t("priceHint") : undefined}>
            {(id) => (
              <input id={id} type="number" inputMode="numeric" min={0} className={input} value={v.priceZeni ?? ""} onChange={(e) => set("priceZeni", numOrNull(e.target.value))} />
            )}
          </Field>
          <Check label={t("countsForPity")} checked={v.countsForPity} onChange={(c) => set("countsForPity", c)} />
          {/* Impérial : fait avancer la pitié, mais seule la Mythique garantie la remet à zéro */}
          {v.countsForPity && (
            <div className="flex flex-col gap-1 pl-8">
              <Check label={t("resetsPity")} checked={v.resetsPity} onChange={(c) => set("resetsPity", c)} />
              <p className="text-xs text-text-muted">{t("resetsPityHint")}</p>
            </div>
          )}
          <Check label={t("bonusEligible")} checked={v.bonusEligible} onChange={(c) => set("bonusEligible", c)} />
          {/* Boost de rareté (Impérial) : les parts des raretés à partir de celle choisie sont multipliées */}
          <Field label={t("rateBoostFrom")} hint={t("rateBoostHint")}>
            {(id) => (
              <select
                id={id}
                className={input}
                value={v.rateBoostFrom ?? ""}
                onChange={(e) => set("rateBoostFrom", e.target.value === "" ? null : (e.target.value as Rarity))}
              >
                <option value="">{t("rateBoostNone")}</option>
                {RARITIES.map((r) => (
                  <option key={r} value={r}>
                    {RARITY_SEAL[r]} {r}
                  </option>
                ))}
              </select>
            )}
          </Field>
          {v.rateBoostFrom !== null && (
            <Field label={t("rateBoost")}>
              {(id) => (
                <input
                  id={id}
                  type="number"
                  inputMode="decimal"
                  min={1}
                  max={10}
                  step={0.1}
                  className={input}
                  value={v.rateBoost / 10_000}
                  onChange={(e) => {
                    const x = Number(e.target.value);
                    if (Number.isFinite(x)) set("rateBoost", Math.min(100_000, Math.max(10_000, Math.round(x * 10_000))));
                  }}
                />
              )}
            </Field>
          )}
        </Section>

        {isBanner && (
          <Section title={t("banner")}>
            {featured.length === 0 ? (
              <p className="text-sm text-shu">{t("featuredEmpty")}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {featured.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 rounded-control bg-surface-2 p-2">
                    <Image src={c.imageUrl} alt="" width={32} height={45} className="h-[45px] w-8 rounded-[3px] object-cover" />
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="font-bold">{c.name}</span>{" "}
                      <span className="text-text-muted">
                        · {RARITY_SEAL[c.rarity as Rarity]} · {c.series}
                      </span>
                    </span>
                    <button
                      type="button"
                      aria-label={t("remove", { name: c.name })}
                      onClick={() => setFeatured((f) => f.filter((x) => x.id !== c.id))}
                      className="inline-flex size-11 items-center justify-center rounded-control text-xl"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <Field label={t("featuredSearch")}>
              {(id) => <input id={id} type="search" className={input} value={query} onChange={(e) => setQuery(e.target.value)} />}
            </Field>
            {query.trim().length >= 2 && results.length > 0 && (
              <ul className="flex flex-col gap-1">
                {results
                  .filter((r) => !featured.some((f) => f.id === r.id))
                  .map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setFeatured((f) => [...f, c])}
                        className="flex min-h-11 w-full items-center gap-3 rounded-control px-2 text-left text-sm hover:bg-surface-2"
                      >
                        <Image src={c.imageUrl} alt="" width={24} height={34} className="h-[34px] w-6 rounded-[2px] object-cover" />
                        <span className="min-w-0 flex-1 truncate">
                          {c.name} <span className="text-text-muted">· #{c.rank} · {c.series}</span>
                        </span>
                        <span className="text-link">{t("add")}</span>
                      </button>
                    </li>
                  ))}
              </ul>
            )}
            {rateFields(t("featuredRate"), t("featuredPity"))}
          </Section>
        )}

        {isFocus && (
          <Section title={t("focus")}>
            <p className="text-sm text-text-muted">{t("focusHint")}</p>
            {focus.length === 0 ? (
              <p className="text-sm text-shu">{t("focusEmpty")}</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {focus.map((s) => (
                  <li key={s.anilistId} className="flex items-center gap-1 rounded-pill bg-surface-2 py-1 pr-1 pl-3 text-sm">
                    <span className="font-bold">{s.title}</span>
                    <span className="text-text-muted">· {t("focusCards", { count: s.cards })}</span>
                    <button
                      type="button"
                      aria-label={t("remove", { name: s.title })}
                      onClick={() => setFocus((f) => f.filter((x) => x.anilistId !== s.anilistId))}
                      className="inline-flex size-11 items-center justify-center rounded-full text-xl"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {focus.length < MAX_FOCUS_SERIES && (
              <Field label={t("focusSearch")}>
                {(id) => <input id={id} type="search" className={input} value={seriesQuery} onChange={(e) => setSeriesQuery(e.target.value)} />}
              </Field>
            )}
            {focus.length < MAX_FOCUS_SERIES && seriesQuery.trim().length >= 2 && seriesResults.length > 0 && (
              <ul className="flex flex-col gap-1">
                {seriesResults
                  .filter((r) => !focus.some((f) => f.anilistId === r.anilistId))
                  .map((s) => (
                    <li key={s.anilistId}>
                      <button
                        type="button"
                        onClick={() => setFocus((f) => [...f, s])}
                        className="flex min-h-11 w-full items-center gap-3 rounded-control px-2 text-left text-sm hover:bg-surface-2"
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {s.title} <span className="text-text-muted">· {s.type === "MANGA" ? t("manga") : t("anime")} · {t("focusCards", { count: s.cards })}</span>
                        </span>
                        <span className="text-link">{t("add")}</span>
                      </button>
                    </li>
                  ))}
              </ul>
            )}
            {rateFields(t("focusRate"), t("focusPity"))}
          </Section>
        )}

        <Section title={t("availability")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("startsAt")}>
              {(id) => (
                <input
                  id={id}
                  type="datetime-local"
                  className={input}
                  value={toLocalInput(v.startsAt)}
                  onChange={(e) => set("startsAt", e.target.value ? new Date(e.target.value).toISOString() : null)}
                />
              )}
            </Field>
            <Field label={t("endsAt")} hint={isFocus ? t("focusEndsHint") : undefined}>
              {(id) => (
                <input
                  id={id}
                  type="datetime-local"
                  className={input}
                  value={toLocalInput(v.endsAt)}
                  onChange={(e) => set("endsAt", e.target.value ? new Date(e.target.value).toISOString() : null)}
                />
              )}
            </Field>
          </div>
          <Check label={t("active")} checked={v.active} onChange={(c) => set("active", c)} />
        </Section>
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
        <p className="text-sm font-bold">{t("preview")}</p>
        <div className="mx-auto w-40">
          <BoosterArt
            shape={v.shape}
            theme={v.theme}
            emblem={v.emblem || "?"}
            name={v.name.fr}
            tagline={v.tagline.fr}
            contents={contentsLabel(ownFloors && floors.length > 0 ? floors.length : globalCards)}
          />
        </div>
        <Button type="submit" variant="primary" disabled={pending}>
          {t("save")}
        </Button>
        {message && (
          <p role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-rarity-uncommon" : "text-shu"}`}>
            {message.text}
          </p>
        )}
      </aside>
    </form>
  );
}
