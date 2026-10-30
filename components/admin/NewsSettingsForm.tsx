"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { NewsPanelView } from "@/components/home/NewsPanelView";
import {
  localizeNews,
  NEWS_ICON_KEYS,
  NEWS_MAX_CARDS,
  NEWS_MAX_ITEMS,
  NEWS_TAGS,
  NEWS_TONES,
  type NewsIcon,
  type NewsTag,
  type NewsTone,
  type NewsVisuals,
} from "@/lib/home/news";
import { newsItemSchema, type NewsConfig, type NewsItem, type NewsLink, type NewsVisual } from "@/lib/home/news-schema";
import { changedSettingKeys } from "@/lib/settings/form";
import { NEWS_SETTING_KEYS, newsSettingsSchema, type NewsSettings } from "@/lib/settings/news-form";
import { searchFeaturedCards, type FeaturedCandidate } from "@/server/actions/admin-boosters";
import { previewNewsVisuals, updateNewsSettings } from "@/server/actions/admin-settings";
import { Button, buttonClasses } from "../ui/Button";
import { Field, inputClass, SelectField, Toggle } from "./fields";
import { SettingsSaveBar } from "./SettingsSaveBar";

type Lang = "fr" | "en";
type Text = { fr: string; en: string };
/** Carte déjà rencontrée (visuels résolus, résultats de recherche) : de quoi nommer sa pastille. */
type KnownCard = { id: string; name: string; imageUrl: string };
export type NewsBoosterOption = { slug: string; name: string; active: boolean };

const UPLOAD_ERRORS = ["IMAGE_INVALID", "IMAGE_TOO_LARGE", "RATE_LIMITED", "STORAGE_UNAVAILABLE", "UPLOAD_FAILED"] as const;

const newItem = (): NewsItem => ({
  id: `n-${crypto.randomUUID().slice(0, 8)}`,
  tone: "kin",
  icon: "NEW",
  tag: null,
  title: { fr: "", en: "" },
  body: { fr: "", en: "" },
  link: { kind: "none" },
  visual: { kind: "none" },
});

/** Valeur de départ d'un visuel quand on change de sorte (invalide tant qu'il n'est pas rempli). */
function visualOfKind(kind: NewsVisual["kind"]): NewsVisual {
  if (kind === "cards") return { kind, cardIds: [] };
  if (kind === "booster") return { kind, slug: "" };
  if (kind === "image") return { kind, url: "", focalX: 50, focalY: 50 };
  return { kind: "none" };
}

/** Champ en deux langues : le français obligatoire, l'anglais facultatif (le français s'affiche à sa place). */
function Bilingual({
  label,
  value,
  onChange,
  max,
  rows,
  invalid,
}: {
  label: (lang: Lang) => string;
  value: Text;
  onChange: (v: Text) => void;
  max: number;
  rows?: number;
  invalid?: boolean;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {(["fr", "en"] as const).map((lang) => (
        <Field key={lang} label={label(lang)}>
          {(id) =>
            rows ? (
              <textarea
                id={id}
                value={value[lang]}
                maxLength={max}
                rows={rows}
                aria-invalid={(lang === "fr" && invalid) || undefined}
                onChange={(e) => onChange({ ...value, [lang]: e.target.value })}
                className={`${inputClass} py-2`}
              />
            ) : (
              <input
                id={id}
                value={value[lang]}
                maxLength={max}
                aria-invalid={(lang === "fr" && invalid) || undefined}
                onChange={(e) => onChange({ ...value, [lang]: e.target.value })}
                className={inputClass}
              />
            )
          }
        </Field>
      ))}
    </div>
  );
}

/** Cartes de l'éventail : pastilles à réordonner ou retirer, recherche à la frappe pour en ajouter. */
function CardPicker({
  ids,
  onChange,
  known,
  remember,
}: {
  ids: string[];
  onChange: (ids: string[]) => void;
  known: Record<string, KnownCard>;
  remember: (cards: KnownCard[]) => void;
}) {
  const t = useTranslations("admin.news");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FeaturedCandidate[]>([]);
  const searchable = query.trim().length >= 2;
  const full = ids.length >= NEWS_MAX_CARDS;
  const move = (index: number, delta: -1 | 1) => {
    const next = [...ids];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    onChange(next);
  };

  useEffect(() => {
    if (!searchable) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const rows = await searchFeaturedCards(query).catch(() => []);
      if (cancelled) return;
      setResults(rows);
      remember(rows.map((r) => ({ id: r.id, name: r.name, imageUrl: r.imageUrl })));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, remember, searchable]);

  const shown = searchable ? results.filter((r) => !ids.includes(r.id)) : [];
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {ids.length === 0 ? (
        <p className="text-sm text-shu">{t("cardsNone")}</p>
      ) : (
        <ol className="flex flex-wrap gap-2">
          {ids.map((id, i) => {
            const card = known[id];
            const name = card?.name ?? id;
            return (
              <li key={id} className="flex items-center gap-1 rounded-control border border-border bg-surface py-1 pr-1 pl-1.5">
                {card && (
                  // eslint-disable-next-line @next/next/no-img-element -- vignette d'admin, déjà servie par le catalogue
                  <img src={card.imageUrl} alt="" className="h-9 w-7 rounded-[3px] object-cover" />
                )}
                <span className="max-w-36 truncate text-sm">{name}</span>
                <button type="button" aria-label={t("cardLeft", { name })} disabled={i === 0} onClick={() => move(i, -1)} className="min-h-11 min-w-9 text-sm disabled:opacity-30">
                  ←
                </button>
                <button type="button" aria-label={t("cardRight", { name })} disabled={i === ids.length - 1} onClick={() => move(i, 1)} className="min-h-11 min-w-9 text-sm disabled:opacity-30">
                  →
                </button>
                <button type="button" aria-label={t("cardRemove", { name })} onClick={() => onChange(ids.filter((x) => x !== id))} className="min-h-11 min-w-9 text-base">
                  ×
                </button>
              </li>
            );
          })}
        </ol>
      )}
      {!full && (
        <Field label={t("cardsSearch")} hint={t("cardsSearchHint")}>
          {(id) => <input id={id} type="search" value={query} maxLength={80} onChange={(e) => setQuery(e.target.value)} className={inputClass} />}
        </Field>
      )}
      {!full && searchable && (
        <ul className="flex max-h-64 flex-col overflow-y-auto rounded-control border border-border bg-surface">
          {shown.length === 0 ? (
            <li className="px-3 py-2 text-sm text-text-muted">{t("cardsNoResult")}</li>
          ) : (
            shown.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange([...ids, r.id]);
                    setQuery("");
                  }}
                  className="flex min-h-11 w-full items-center gap-3 px-3 py-1.5 text-left text-sm hover:bg-surface-2"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- vignette d'admin, déjà servie par le catalogue */}
                  <img src={r.imageUrl} alt="" className="h-10 w-7 shrink-0 rounded-[3px] object-cover" />
                  <span className="min-w-0 flex-1 truncate">{r.name}</span>
                  <span className="shrink-0 text-xs text-text-muted">
                    {r.series} · {r.rarity}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

/** Image de fond : téléversement vers le stockage (route admin), vignette et point de recadrage. */
function ImagePicker({ visual, onChange }: { visual: Extract<NewsVisual, { kind: "image" }>; onChange: (visual: NewsVisual) => void }) {
  const t = useTranslations("admin.news");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const upload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch("/api/admin/nouveautes/upload", { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as { url?: unknown; error?: unknown };
      if (res.ok && typeof data.url === "string") onChange({ ...visual, url: data.url });
      else setError(t(`imageErrors.${UPLOAD_ERRORS.find((e) => e === data.error) ?? "UPLOAD_FAILED"}`));
    } catch {
      setError(t("imageErrors.UPLOAD_FAILED"));
    } finally {
      setUploading(false);
    }
  };
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {visual.url && (
        <div className="relative aspect-[16/7] w-full max-w-md overflow-hidden rounded-card border border-border">
          {/* eslint-disable-next-line @next/next/no-img-element -- aperçu de l'image téléversée, recadrée en direct */}
          <img src={visual.url} alt="" className="size-full object-cover" style={{ objectPosition: `${visual.focalX}% ${visual.focalY}%` }} />
        </div>
      )}
      <label className={buttonClasses("secondary", `self-start ${uploading ? "pointer-events-none opacity-60" : "cursor-pointer"}`)}>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          disabled={uploading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void upload(file);
          }}
        />
        {uploading ? t("imageUploading") : visual.url ? t("imageReplace") : t("imageUpload")}
      </label>
      <p className="text-xs text-text-muted">{t("imageHint")}</p>
      {error && (
        <p role="alert" className="text-sm text-shu">
          {error}
        </p>
      )}
      {visual.url && (
        <div className="grid gap-3 sm:grid-cols-2">
          {(["focalX", "focalY"] as const).map((axis) => (
            <Field key={axis} label={t(axis, { value: visual[axis] })}>
              {(id) => (
                <input
                  id={id}
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={visual[axis]}
                  onChange={(e) => onChange({ ...visual, [axis]: Number(e.target.value) })}
                  className="min-h-11 w-full accent-[var(--color-shu)]"
                />
              )}
            </Field>
          ))}
        </div>
      )}
    </div>
  );
}

/** Une nouveauté : couleur, sceau, étiquette, visuel, titre et texte en deux langues, bouton facultatif. */
function ItemEditor({
  item,
  index,
  count,
  boosters,
  known,
  remember,
  onChange,
  onMove,
  onRemove,
}: {
  item: NewsItem;
  index: number;
  count: number;
  boosters: NewsBoosterOption[];
  known: Record<string, KnownCard>;
  remember: (cards: KnownCard[]) => void;
  onChange: (item: NewsItem) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("admin.news");
  const tn = useTranslations("news");
  const issues = newsItemSchema.safeParse(item).error?.issues ?? [];
  const invalid = (...path: string[]) => issues.some((issue) => path.every((p, i) => String(issue.path[i]) === p));
  const label = item.link.kind === "none" ? { fr: "", en: "" } : item.link.label;
  const setLink = (kind: NewsLink["kind"]) => {
    if (kind === "none") return onChange({ ...item, link: { kind } });
    const href = item.link.kind === kind ? item.link.href : kind === "internal" ? "/" : "https://";
    onChange({ ...item, link: { kind, href, label } });
  };
  const visual = item.visual;
  const setVisual = (next: NewsVisual) => onChange({ ...item, visual: next });

  return (
    <fieldset className="flex min-w-0 flex-col gap-3 rounded-card border border-border p-3">
      <legend className="px-1 text-sm font-bold">{t("item", { n: index + 1 })}</legend>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => onMove(-1)} disabled={index === 0}>
          {t("up")}
        </Button>
        <Button type="button" onClick={() => onMove(1)} disabled={index === count - 1}>
          {t("down")}
        </Button>
        <Button type="button" onClick={onRemove}>
          {t("remove")}
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <SelectField<NewsTone>
          label={t("tone")}
          value={item.tone}
          onChange={(tone) => onChange({ ...item, tone })}
          options={NEWS_TONES.map((tone) => ({ value: tone, label: t(`tones.${tone}`) }))}
        />
        <SelectField<NewsIcon | "">
          label={t("icon")}
          value={item.icon ?? ""}
          onChange={(icon) => onChange({ ...item, icon: icon === "" ? null : icon })}
          options={[{ value: "", label: t("noIcon") }, ...NEWS_ICON_KEYS.map((icon) => ({ value: icon, label: t(`icons.${icon}`) }))]}
        />
        <SelectField<NewsTag | "">
          label={t("tag")}
          value={item.tag ?? ""}
          onChange={(tag) => onChange({ ...item, tag: tag === "" ? null : tag })}
          options={[{ value: "", label: t("noTag") }, ...NEWS_TAGS.map((tag) => ({ value: tag, label: tn(`tags.${tag}`) }))]}
        />
      </div>

      <div className="flex min-w-0 flex-col gap-3 rounded-card bg-surface-2/40 p-3">
        <SelectField<NewsVisual["kind"]>
          label={t("visual")}
          value={visual.kind}
          onChange={(kind) => kind !== visual.kind && setVisual(visualOfKind(kind))}
          options={(["none", "cards", "booster", "image"] as const).map((kind) => ({ value: kind, label: t(`visuals.${kind}`) }))}
        />
        {visual.kind === "cards" && (
          <CardPicker ids={visual.cardIds} known={known} remember={remember} onChange={(cardIds) => setVisual({ kind: "cards", cardIds })} />
        )}
        {visual.kind === "booster" && (
          <SelectField<string>
            label={t("booster")}
            hint={t("boosterHint")}
            value={visual.slug}
            onChange={(slug) => setVisual({ kind: "booster", slug })}
            options={[{ value: "", label: t("boosterPick") }, ...boosters.map((b) => ({ value: b.slug, label: b.active ? b.name : `${b.name} ${t("boosterOff")}` }))]}
          />
        )}
        {visual.kind === "image" && <ImagePicker visual={visual} onChange={setVisual} />}
      </div>

      <Bilingual label={(l) => t(`itemTitle_${l}`)} value={item.title} max={80} invalid={invalid("title")} onChange={(title) => onChange({ ...item, title })} />
      <Bilingual label={(l) => t(`body_${l}`)} value={item.body} max={400} rows={3} invalid={invalid("body")} onChange={(body) => onChange({ ...item, body })} />
      <SelectField<NewsLink["kind"]>
        label={t("link")}
        value={item.link.kind}
        onChange={setLink}
        options={(["none", "internal", "external"] as const).map((kind) => ({ value: kind, label: t(`links.${kind}`) }))}
      />
      {item.link.kind !== "none" && (
        <>
          <Field label={t("href")} hint={t(item.link.kind === "internal" ? "hrefInternalHint" : "hrefExternalHint")}>
            {(id) => (
              <input
                id={id}
                value={item.link.kind === "none" ? "" : item.link.href}
                maxLength={item.link.kind === "internal" ? 200 : 300}
                inputMode="url"
                aria-invalid={invalid("link", "href") || undefined}
                onChange={(e) => item.link.kind !== "none" && onChange({ ...item, link: { ...item.link, href: e.target.value.trim() } })}
                className={inputClass}
              />
            )}
          </Field>
          <Bilingual
            label={(l) => t(`label_${l}`)}
            value={label}
            max={40}
            invalid={invalid("link", "label")}
            onChange={(next) => item.link.kind !== "none" && onChange({ ...item, link: { ...item.link, label: next } })}
          />
        </>
      )}
    </fieldset>
  );
}

/** Ce que l'aperçu doit faire résoudre par le serveur : les cartes et boosters choisis, rien d'autre. */
function lookupsOf(items: readonly NewsItem[]) {
  return items.flatMap((i) =>
    (i.visual.kind === "cards" && i.visual.cardIds.length > 0) || (i.visual.kind === "booster" && i.visual.slug) ? [{ id: i.id, visual: i.visual }] : [],
  );
}

/**
 * Encart « Nouveautés » de l'accueil : interrupteur, titre et intro, jusqu'à six nouveautés avec leur
 * visuel (cartes, booster, image), aperçu en direct du carrousel (à droite de la configuration sur
 * grand écran, collé en haut pendant le défilement). La révision et la date de publication sont posées
 * par le serveur (« rouvrir chez tous »).
 */
export function NewsSettingsForm({ initial, boosters, initialVisuals }: { initial: NewsSettings; boosters: NewsBoosterOption[]; initialVisuals: NewsVisuals }) {
  const t = useTranslations("admin.news");
  const [draft, setDraft] = useState(initial);
  const [reopen, setReopen] = useState(true);
  const [previewLang, setPreviewLang] = useState<Lang>("fr");
  const [visuals, setVisuals] = useState(initialVisuals);
  const [refreshing, setRefreshing] = useState(false);
  const [known, setKnown] = useState<Record<string, KnownCard>>(() => {
    const cards = Object.values(initialVisuals).flatMap((v) => (v.kind === "cards" || v.kind === "booster" ? v.cards : []));
    return Object.fromEntries(cards.map((c) => [c.id, { id: c.id, name: c.name, imageUrl: c.imageUrl }]));
  });
  const news = draft["home.news"];
  const set = (patch: Partial<NewsConfig>) => setDraft((d) => ({ ...d, "home.news": { ...d["home.news"], ...patch } }));
  const setItems = (items: NewsItem[]) => set({ items });
  const move = (index: number, delta: -1 | 1) => {
    const items = [...news.items];
    [items[index], items[index + delta]] = [items[index + delta], items[index]];
    setItems(items);
  };
  const remember = useCallback((cards: KnownCard[]) => setKnown((k) => ({ ...k, ...Object.fromEntries(cards.map((c) => [c.id, c])) })), []);

  // Les visuels de l'aperçu suivent le brouillon : le serveur résout cartes et boosters, comme sur l'accueil
  const lookups = lookupsOf(news.items);
  const lookupKey = JSON.stringify([previewLang, lookups]);
  const resolvedKey = useRef(JSON.stringify(["fr", lookupsOf(initial["home.news"].items)]));
  useEffect(() => {
    if (lookupKey === resolvedKey.current) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setRefreshing(true);
      const [lang, items] = JSON.parse(lookupKey) as [Lang, ReturnType<typeof lookupsOf>];
      const next = await previewNewsVisuals(items, lang).catch(() => null);
      if (cancelled) return;
      setRefreshing(false);
      if (!next) return;
      resolvedKey.current = lookupKey;
      setVisuals(next);
      remember(Object.values(next).flatMap((v) => (v.kind === "cards" || v.kind === "booster" ? v.cards : [])));
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [lookupKey, remember]);

  const valid = newsSettingsSchema.safeParse(draft).success;
  const changed = valid ? changedSettingKeys(NEWS_SETTING_KEYS, initial, draft) : [];
  const preview = localizeNews({ ...news, enabled: true }, previewLang, visuals);
  // Les liens de l'aperçu ne quittent pas le formulaire (les modifications en cours seraient perdues)
  const stayHere = (e: MouseEvent) => {
    if ((e.target as Element).closest("a")) e.preventDefault();
  };

  return (
    <form className="flex max-w-3xl flex-col gap-6 xl:grid xl:max-w-none xl:grid-cols-2 xl:items-start" onSubmit={(e) => e.preventDefault()}>
      <div className="flex min-w-0 flex-col gap-6 xl:col-start-1 xl:row-start-1">
        <fieldset className="flex min-w-0 flex-col gap-4 lacquer rounded-card p-4">
          <legend className="px-1 font-title text-lg font-bold">{t("panelSection")}</legend>
          <Toggle label={t("enabled")} checked={news.enabled} onChange={(enabled) => set({ enabled })} />
          <Bilingual label={(l) => t(`title_${l}`)} value={news.title} max={80} invalid={!news.title.fr.trim()} onChange={(title) => set({ title })} />
          <Bilingual label={(l) => t(`intro_${l}`)} value={news.intro} max={240} rows={2} onChange={(intro) => set({ intro })} />
        </fieldset>

        <fieldset className="flex min-w-0 flex-col gap-4 lacquer rounded-card p-4">
          <legend className="px-1 font-title text-lg font-bold">{t("itemsSection", { count: news.items.length, max: NEWS_MAX_ITEMS })}</legend>
          {news.items.map((item, i) => (
            <ItemEditor
              key={item.id}
              item={item}
              index={i}
              count={news.items.length}
              boosters={boosters}
              known={known}
              remember={remember}
              onChange={(next) => setItems(news.items.map((it, j) => (j === i ? next : it)))}
              onMove={(delta) => move(i, delta)}
              onRemove={() => setItems(news.items.filter((_, j) => j !== i))}
            />
          ))}
          <Button type="button" className="self-start" disabled={news.items.length >= NEWS_MAX_ITEMS} onClick={() => setItems([...news.items, newItem()])}>
            {t("add")}
          </Button>
        </fieldset>
      </div>

      {/* Grand écran : à droite de la configuration, collé sous l'en-tête, sans avoir à descendre */}
      <fieldset className="flex min-w-0 flex-col gap-3 lacquer rounded-card p-4 xl:sticky xl:top-24 xl:col-start-2 xl:row-span-2 xl:row-start-1 xl:max-h-[calc(100dvh-7rem)] xl:overflow-y-auto xl:overscroll-contain">
        <legend className="px-1 font-title text-lg font-bold">{t("previewSection")}</legend>
        <div role="group" aria-label={t("previewLang")} className="flex gap-2">
          {(["fr", "en"] as const).map((lang) => (
            <Button key={lang} type="button" aria-pressed={previewLang === lang} variant={previewLang === lang ? "primary" : undefined} onClick={() => setPreviewLang(lang)}>
              {t(`langs.${lang}`)}
            </Button>
          ))}
        </div>
        {!news.enabled && <p className="text-sm text-shu">{t("previewOff")}</p>}
        <p role="status" className="min-h-5 text-xs text-text-muted">
          {refreshing ? t("previewRefreshing") : ""}
        </p>
        {preview ? (
          <div onClickCapture={stayHere}>
            <NewsPanelView key={previewLang} news={preview} initialCollapsed={false} preview />
          </div>
        ) : (
          <p className="text-sm text-text-muted">{t("previewEmpty")}</p>
        )}
      </fieldset>

      <div className="flex min-w-0 flex-col gap-6 xl:col-start-1 xl:row-start-2">
        <div className="flex flex-col gap-1">
          <Toggle label={t("reopen")} checked={reopen} onChange={setReopen} />
          <p className="text-xs text-text-muted">{t("reopenHint")}</p>
        </div>
        <SettingsSaveBar
          valid={valid}
          changedLabels={changed.map(() => t(reopen ? "changeReopen" : "changeQuiet"))}
          save={() => updateNewsSettings(draft, reopen)}
        />
      </div>
    </form>
  );
}
