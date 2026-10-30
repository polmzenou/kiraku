"use client";

import { useTranslations } from "next-intl";
import { useState, type MouseEvent } from "react";
import { NewsPanelView } from "@/components/home/NewsPanelView";
import { localizeNews, NEWS_ICON_KEYS, NEWS_MAX_ITEMS, NEWS_TONES, type NewsIcon, type NewsTone } from "@/lib/home/news";
import { newsItemSchema, type NewsConfig, type NewsItem, type NewsLink } from "@/lib/home/news-schema";
import { changedSettingKeys } from "@/lib/settings/form";
import { NEWS_SETTING_KEYS, newsSettingsSchema, type NewsSettings } from "@/lib/settings/news-form";
import { updateNewsSettings } from "@/server/actions/admin-settings";
import { Button } from "../ui/Button";
import { Field, inputClass, SelectField, Toggle } from "./fields";
import { SettingsSaveBar } from "./SettingsSaveBar";

type Lang = "fr" | "en";
type Text = { fr: string; en: string };

const newItem = (): NewsItem => ({
  id: `n-${crypto.randomUUID().slice(0, 8)}`,
  tone: "kin",
  icon: "NEW",
  title: { fr: "", en: "" },
  body: { fr: "", en: "" },
  link: { kind: "none" },
});

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

/** Une nouveauté : couleur, sceau, titre et texte en deux langues, bouton facultatif vers une page ou un lien https. */
function ItemEditor({
  item,
  index,
  count,
  onChange,
  onMove,
  onRemove,
}: {
  item: NewsItem;
  index: number;
  count: number;
  onChange: (item: NewsItem) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("admin.news");
  const issues = newsItemSchema.safeParse(item).error?.issues ?? [];
  const invalid = (...path: string[]) => issues.some((issue) => path.every((p, i) => String(issue.path[i]) === p));
  const label = item.link.kind === "none" ? { fr: "", en: "" } : item.link.label;
  const setLink = (kind: NewsLink["kind"]) => {
    if (kind === "none") return onChange({ ...item, link: { kind } });
    const href = item.link.kind === kind ? item.link.href : kind === "internal" ? "/" : "https://";
    onChange({ ...item, link: { kind, href, label } });
  };

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
      <div className="grid gap-3 sm:grid-cols-2">
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

/**
 * Encart « Nouveautés » de l'accueil : interrupteur, titre et intro, jusqu'à six nouveautés, aperçu en
 * direct. La révision et la date de publication sont posées par le serveur (« rouvrir chez tous »).
 */
export function NewsSettingsForm({ initial }: { initial: NewsSettings }) {
  const t = useTranslations("admin.news");
  const [draft, setDraft] = useState(initial);
  const [reopen, setReopen] = useState(true);
  const [previewLang, setPreviewLang] = useState<Lang>("fr");
  const news = draft["home.news"];
  const set = (patch: Partial<NewsConfig>) => setDraft((d) => ({ ...d, "home.news": { ...d["home.news"], ...patch } }));
  const setItems = (items: NewsItem[]) => set({ items });
  const move = (index: number, delta: -1 | 1) => {
    const items = [...news.items];
    [items[index], items[index + delta]] = [items[index + delta], items[index]];
    setItems(items);
  };

  const valid = newsSettingsSchema.safeParse(draft).success;
  const changed = valid ? changedSettingKeys(NEWS_SETTING_KEYS, initial, draft) : [];
  const preview = localizeNews({ ...news, enabled: true }, previewLang);
  // Les liens de l'aperçu ne quittent pas le formulaire (les modifications en cours seraient perdues)
  const stayHere = (e: MouseEvent) => {
    if ((e.target as Element).closest("a")) e.preventDefault();
  };

  return (
    <form className="flex max-w-3xl flex-col gap-6" onSubmit={(e) => e.preventDefault()}>
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
            onChange={(next) => setItems(news.items.map((it, j) => (j === i ? next : it)))}
            onMove={(delta) => move(i, delta)}
            onRemove={() => setItems(news.items.filter((_, j) => j !== i))}
          />
        ))}
        <Button type="button" className="self-start" disabled={news.items.length >= NEWS_MAX_ITEMS} onClick={() => setItems([...news.items, newItem()])}>
          {t("add")}
        </Button>
      </fieldset>

      <fieldset className="flex min-w-0 flex-col gap-3 lacquer rounded-card p-4">
        <legend className="px-1 font-title text-lg font-bold">{t("previewSection")}</legend>
        <div role="group" aria-label={t("previewLang")} className="flex gap-2">
          {(["fr", "en"] as const).map((lang) => (
            <Button key={lang} type="button" aria-pressed={previewLang === lang} variant={previewLang === lang ? "primary" : undefined} onClick={() => setPreviewLang(lang)}>
              {t(`langs.${lang}`)}
            </Button>
          ))}
        </div>
        {!news.enabled && <p className="text-sm text-shu">{t("previewOff")}</p>}
        {preview ? (
          <div onClickCapture={stayHere}>
            <NewsPanelView key={previewLang} news={preview} initialCollapsed={false} preview />
          </div>
        ) : (
          <p className="text-sm text-text-muted">{t("previewEmpty")}</p>
        )}
      </fieldset>

      <div className="flex flex-col gap-1">
        <Toggle label={t("reopen")} checked={reopen} onChange={setReopen} />
        <p className="text-xs text-text-muted">{t("reopenHint")}</p>
      </div>
      <SettingsSaveBar
        valid={valid}
        changedLabels={changed.map(() => t(reopen ? "changeReopen" : "changeQuiet"))}
        save={() => updateNewsSettings(draft, reopen)}
      />
    </form>
  );
}
