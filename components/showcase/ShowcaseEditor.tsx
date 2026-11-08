"use client";

import { LazyMotion, m } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { Fuda } from "@/components/fuda/Fuda";
import { useRouter } from "@/i18n/navigation";
import type { CollectionItem, ShowcaseCard } from "@/lib/collection/view";
import { layoutCapacity, SHOWCASE_LAYOUTS, type ShowcaseLayoutId } from "@/lib/showcase/layouts";
import { SHOWCASE_NAME_MAX } from "@/lib/showcase/name";
import { addToSlots, fitToCapacity, placeInSlot, slotAtPoint, swapSlots } from "@/lib/showcase/slots";
import type { ShowcaseThemeId, ThemeChoice } from "@/lib/showcase/theme-registry";
import {
  addShowcaseCardsAction,
  deleteShowcaseAction,
  fillShowcaseAction,
  myThemeChoicesAction,
  setShowcaseCardsAction,
  updateShowcaseAction,
  type ShowcaseActionError,
} from "@/server/actions/showcases";
import { loadDomMax } from "../motion/load-features";
import { ShareProfileButton } from "../profile/ShareProfileButton";
import { ShowcasePicker } from "../profile/ShowcasePicker";
import { Button } from "../ui/Button";
import { Sheet } from "../ui/Sheet";
import { LayoutPicker } from "./LayoutPicker";
import { MakeMainButton } from "./MakeMainButton";
import { ShowcaseHeading } from "./ShowcaseHeading";
import { cardSizing, ShowcaseStage, type StageSlot } from "./ShowcaseStage";
import { ShowcaseCardLink } from "./ShowcaseView";
import { ThemePicker } from "./ThemePicker";

type Slot = ShowcaseCard | null;
type SheetName = "layout" | "theme" | "more" | "rename" | "delete" | null;
type Status = "idle" | "saving" | "saved" | "error";

const toolButton = "min-h-11 rounded-control border border-border bg-surface-2 px-3 text-sm font-bold disabled:opacity-40";

const withPositions = (list: readonly Slot[]) => list.map((s, i) => (s ? { ...s, position: i + 1 } : null));

/**
 * Vitrine de son propriétaire : lecture, puis mode édition. Chaque carte se glisse vers une autre case
 * (échange) ; toucher une carte la sélectionne (Changer, Vedette, ← →, Retirer, aussi au clavier).
 * Disposition, thème, remplissage, nom, mise à l'honneur et suppression depuis la barre d'outils.
 * Mise à jour immédiate à l'écran, enregistrement en arrière-plan, retour en arrière si refus.
 */
export function ShowcaseEditor({
  id,
  username,
  ownerTitle,
  name: initialName,
  untitled,
  layout: initialLayout,
  theme: initialTheme,
  storedTheme,
  cards: initialCards,
  showcaseIds,
  isMain,
  startEditing = false,
}: {
  id: string;
  username: string;
  /** Titre du partage (« Vitrine de … »). */
  ownerTitle: string;
  name: string | null;
  /** Nom affiché d'une vitrine sans nom (« Vitrine 2 »). */
  untitled: string;
  layout: ShowcaseLayoutId;
  /** Thème affiché (Sans décor s'il n'est plus disponible) et thème enregistré (acquis). */
  theme: ShowcaseThemeId;
  storedTheme: ShowcaseThemeId;
  cards: Slot[];
  /** Vitrines du joueur dans l'ordre (la première est la principale). */
  showcaseIds: readonly string[];
  /** Vitrine principale : la seule affichée sur le profil et visible par les autres joueurs. */
  isMain: boolean;
  startEditing?: boolean;
}) {
  const t = useTranslations("showcase");
  const router = useRouter();
  const renameId = useId();
  const [cards, setCards] = useState<Slot[]>(initialCards);
  const [layout, setLayout] = useState(initialLayout);
  const [theme, setTheme] = useState(initialTheme);
  const [owned, setOwned] = useState(storedTheme);
  const [name, setName] = useState(initialName);
  const [draftName, setDraftName] = useState(initialName ?? "");
  const saved = useRef({ cards: initialCards, layout: initialLayout, theme: initialTheme, name: initialName });
  const [editing, setEditing] = useState(startEditing);
  const [selected, setSelected] = useState<number | null>(null);
  const [picking, setPicking] = useState<{ index: number } | "multi" | null>(null);
  const [sheet, setSheet] = useState<SheetName>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<ShowcaseActionError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const cells = useRef<(HTMLLIElement | null)[]>([]);
  const dragging = useRef(false);
  const [themes, setThemes] = useState<ThemeChoice[] | null>(null);

  useEffect(() => {
    if (sheet !== "theme" || themes) return;
    void myThemeChoicesAction({}).then((res) => setThemes(res.ok ? res.themes : []));
  }, [sheet, themes]);

  const filled = cards.filter((c) => c !== null).length;
  const capacity = layoutCapacity(layout);
  const shownIds = new Set(cards.flatMap((c) => (c ? [c.cardId] : [])));
  const displayName = name ?? untitled;

  /** Enregistre un changement : état affiché tout de suite, restauré si le serveur refuse. */
  function persist(run: () => Promise<{ ok: true } | { ok: false; error: ShowcaseActionError }>, rollback: () => void, after?: () => void) {
    setStatus("saving");
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await run().catch(() => ({ ok: false as const, error: "UNAVAILABLE" as const }));
      if (!res.ok) {
        rollback();
        setStatus("error");
        setError(res.error);
        return;
      }
      setStatus("saved");
      after?.();
    });
  }

  const saveCards = (next: Slot[]) => {
    const list = withPositions(next);
    setCards(list);
    persist(
      async () => {
        const res = await setShowcaseCardsAction({ showcaseId: id, slots: list.map((s) => s?.cardId ?? null) });
        if (res.ok) saved.current.cards = list;
        return res;
      },
      () => setCards(saved.current.cards),
    );
  };

  const byId = (extra: readonly ShowcaseCard[] = []) => new Map([...cards, ...extra].flatMap((c) => (c ? [[c.cardId, c] as const] : [])));

  const swap = (from: number, to: number) => {
    if (to < 0 || to >= cards.length) return;
    saveCards(swapSlots(cards, from, to));
    setSelected(to);
  };
  const remove = (index: number) => {
    saveCards(cards.map((c, i) => (i === index ? null : c)));
    setSelected(null);
  };

  const pickOne = (item: CollectionItem) => {
    if (picking === null || picking === "multi") return;
    const ids = placeInSlot(cards.map((c) => c?.cardId ?? null), picking.index, item.cardId);
    const map = byId([{ ...item, position: picking.index + 1 }]);
    saveCards(ids.map((cardId) => (cardId ? map.get(cardId)! : null)));
    setPicking(null);
  };

  const addMany = (items: CollectionItem[]) => {
    setPicking(null);
    const ids = addToSlots(cards.map((c) => c?.cardId ?? null), items.map((i) => i.cardId));
    if (!ids) {
      setError("FULL");
      return;
    }
    const map = byId(items.map((i) => ({ ...i, position: 0 })));
    const next = withPositions(ids.map((cardId) => (cardId ? map.get(cardId)! : null)));
    setCards(next);
    persist(
      async () => {
        const res = await addShowcaseCardsAction({ showcaseId: id, cardIds: items.map((i) => i.cardId) });
        if (res.ok) saved.current.cards = next;
        return res;
      },
      () => setCards(saved.current.cards),
    );
  };

  const dropAt = (from: number, point: { x: number; y: number }) => {
    const rects = cells.current.map((el) => {
      const r = el?.getBoundingClientRect();
      return r ? { left: r.left, top: r.top, width: r.width, height: r.height } : { left: 0, top: 0, width: 0, height: 0 };
    });
    // Motion donne la position dans la page ; les rectangles sont dans la fenêtre
    const to = slotAtPoint(point.x - window.scrollX, point.y - window.scrollY, rects);
    if (to >= 0 && to !== from) swap(from, to);
  };

  const chooseLayout = (next: ShowcaseLayoutId) => {
    setSheet(null);
    if (next === layout) return;
    const ids = fitToCapacity(cards.map((c) => c?.cardId ?? null), layoutCapacity(next));
    const map = byId();
    const nextCards = withPositions(ids.map((cardId) => (cardId ? map.get(cardId)! : null)));
    setLayout(next);
    setCards(nextCards);
    setSelected(null);
    persist(
      async () => {
        const res = await updateShowcaseAction({ showcaseId: id, layout: next });
        if (res.ok) saved.current = { ...saved.current, layout: next, cards: nextCards };
        return res;
      },
      () => {
        setLayout(saved.current.layout);
        setCards(saved.current.cards);
      },
      () => router.refresh(),
    );
  };

  const chooseTheme = (next: ShowcaseThemeId) => {
    setSheet(null);
    if (next === theme) return;
    setTheme(next);
    persist(
      async () => {
        const res = await updateShowcaseAction({ showcaseId: id, theme: next });
        if (res.ok) {
          saved.current.theme = next;
          setOwned(next);
        }
        return res;
      },
      () => setTheme(saved.current.theme),
      () => router.refresh(),
    );
  };

  const rename = () => {
    setSheet(null);
    const next = draftName.trim() === "" ? null : draftName.trim();
    setName(next);
    persist(
      async () => {
        const res = await updateShowcaseAction({ showcaseId: id, name: draftName });
        if (res.ok) saved.current.name = next;
        return res;
      },
      () => setName(saved.current.name),
      () => router.refresh(),
    );
  };

  const fill = () =>
    persist(
      async () => {
        const res = await fillShowcaseAction({ showcaseId: id, minRarity: null });
        if (res.ok) {
          setCards(res.cards);
          saved.current.cards = res.cards;
          if (res.added === 0) setNotice(t("editor.fillNone"));
        }
        return res;
      },
      () => setCards(saved.current.cards),
    );

  const destroy = () =>
    startTransition(async () => {
      const res = await deleteShowcaseAction({ showcaseId: id });
      if (!res.ok) {
        setSheet(null);
        setStatus("error");
        setError(res.error);
        return;
      }
      router.push(`/u/${username}`);
    });

  const slots: StageSlot[] = cards.map((card, i) => {
    if (!editing) {
      return card
        ? { node: <ShowcaseCardLink card={card} layout={layout} index={i} linkBase="/collection" owned={false} preload={i < 2} />, rarity: card.rarity }
        : { node: <span aria-hidden="true" className="vt-empty" />, empty: true };
    }
    if (!card) {
      return {
        node: (
          <button type="button" className="vt-empty" onClick={() => setPicking({ index: i })} aria-label={t("addTo", { n: i + 1 })}>
            <span aria-hidden="true">+</span>
          </button>
        ),
        empty: true,
      };
    }
    const { size, sizes } = cardSizing(layout, i);
    return {
      rarity: card.rarity,
      selected: selected === i,
      node: (
        <m.button
          type="button"
          layoutId={`vt-${id}-${card.cardId}`}
          layout="position"
          drag
          dragSnapToOrigin
          dragElastic={0.9}
          dragMomentum={false}
          whileDrag={{ scale: 1.06, zIndex: 20 }}
          onDragStart={() => {
            dragging.current = true;
          }}
          onDragEnd={(_, info) => {
            dropAt(i, info.point);
            setTimeout(() => {
              dragging.current = false;
            }, 0);
          }}
          onClick={() => {
            if (!dragging.current) setSelected((s) => (s === i ? null : i));
          }}
          aria-pressed={selected === i}
          aria-label={t("selectCard", { name: card.name, n: i + 1 })}
          style={{ touchAction: "none" }}
          className="block w-full cursor-grab rounded-[7px] active:cursor-grabbing"
        >
          <Fuda card={card} series={card.series} size={size} sizes={sizes} tilt={false} />
        </m.button>
      ),
    };
  });

  const current = selected !== null ? cards[selected] : null;
  const hasHero = SHOWCASE_LAYOUTS[layout].heroes.length > 0;

  return (
    <LazyMotion features={loadDomMax} strict>
      <div className="flex flex-col gap-4">
        <ShowcaseHeading
          name={displayName}
          count={filled}
          layout={layout}
          theme={theme}
          actions={
            <>
              <Button
                type="button"
                variant={editing ? "primary" : "secondary"}
                aria-pressed={editing}
                onClick={() => {
                  setEditing((e) => !e);
                  setSelected(null);
                }}
              >
                {editing ? t("done") : t("editor.edit")}
              </Button>
              {!editing &&
                (isMain ? (
                  <ShareProfileButton username={username} title={ownerTitle} path={`/u/${username}/vitrines/${id}`} label={t("share")} />
                ) : (
                  <MakeMainButton id={id} showcaseIds={showcaseIds} />
                ))}
            </>
          }
        />

        <p className="-mt-2 flex items-center gap-1.5 text-xs text-text-muted">
          <span aria-hidden="true" className={`size-1.5 rounded-full ${isMain ? "bg-hisui" : "bg-text-muted"}`} />
          {isMain ? t("mainBadge") : t("privateBadge")}
        </p>

        {editing && (
          <div role="toolbar" aria-label={t("editor.toolbar")} className="flex flex-wrap gap-2">
            <button type="button" className={toolButton} onClick={() => setSheet("layout")} aria-haspopup="dialog">
              {t("layoutButton")}
            </button>
            <button type="button" className={toolButton} onClick={() => setSheet("theme")} aria-haspopup="dialog">
              {t("editor.theme")}
            </button>
            <button type="button" className={toolButton} onClick={() => setPicking("multi")} disabled={filled >= capacity} aria-haspopup="dialog">
              {t("editor.addCards")}
            </button>
            <button type="button" className={toolButton} onClick={fill} disabled={filled >= capacity || pending}>
              {t("editor.fill")}
            </button>
            <button type="button" className={toolButton} onClick={() => setSheet("more")} aria-haspopup="dialog">
              {t("editor.more")}
            </button>
          </div>
        )}

        <ShowcaseStage
          layout={layout}
          theme={theme}
          slots={slots}
          label={t("stageLabel", { name: displayName, count: filled })}
          slotRef={(i, el) => {
            cells.current[i] = el;
          }}
        />

        {editing && current && selected !== null && (
          <div className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface p-3">
            <p className="w-full text-sm font-bold">{t("editor.selected", { name: current.name, n: selected + 1 })}</p>
            <button type="button" className={toolButton} onClick={() => setPicking({ index: selected })}>
              {t("changeShort")}
            </button>
            {hasHero && selected !== 0 && (
              <button type="button" className={toolButton} onClick={() => swap(selected, 0)}>
                {t("editor.hero")}
              </button>
            )}
            <button type="button" className={toolButton} aria-label={t("moveLeft", { name: current.name })} disabled={selected === 0} onClick={() => swap(selected, selected - 1)}>
              <span aria-hidden="true">←</span>
            </button>
            <button
              type="button"
              className={toolButton}
              aria-label={t("moveRight", { name: current.name })}
              disabled={selected === cards.length - 1}
              onClick={() => swap(selected, selected + 1)}
            >
              <span aria-hidden="true">→</span>
            </button>
            <button type="button" className={`${toolButton} text-shu`} onClick={() => remove(selected)}>
              {t("removeShort")}
            </button>
          </div>
        )}

        <p role="status" aria-live="polite" className="min-h-5 text-sm">
          {status === "error" && error ? (
            <span className="text-shu">{t(`errors.${error}`)}</span>
          ) : notice ? (
            <span className="text-text-muted">{notice}</span>
          ) : editing ? (
            <span className="text-text-muted">{status === "saving" ? t("editor.saving") : status === "saved" ? t("editor.saved") : filled === 0 ? t("emptyOwner", { count: capacity }) : t("dragHint")}</span>
          ) : null}
        </p>
      </div>

      {picking !== null && (
        <ShowcasePicker
          onClose={() => setPicking(null)}
          shownIds={shownIds}
          {...(picking === "multi" ? { multiple: { max: capacity - filled, onConfirm: addMany } } : { onPick: pickOne })}
        />
      )}

      {sheet === "layout" && (
        <Sheet open onClose={() => setSheet(null)} title={t("layoutTitle")} wide>
          <p className="text-sm text-text-muted">{t("layoutHint")}</p>
          <LayoutPicker value={layout} onChange={chooseLayout} filled={filled} />
        </Sheet>
      )}

      {sheet === "theme" && (
        <Sheet open onClose={() => setSheet(null)} title={t("themeTitle")} wide>
          {themes ? (
            <ThemePicker choices={themes} value={theme} current={owned} onChange={chooseTheme} />
          ) : (
            <p className="text-sm text-text-muted">{t("loading")}</p>
          )}
        </Sheet>
      )}

      {sheet === "more" && (
        <Sheet open onClose={() => setSheet(null)} title={t("editor.more")}>
          <div className="flex flex-col gap-2">
            <Button type="button" onClick={() => setSheet("rename")}>
              {t("editor.rename")}
            </Button>
            <Button type="button" onClick={() => setSheet("delete")} className="text-shu">
              {t("editor.delete")}
            </Button>
          </div>
        </Sheet>
      )}

      {sheet === "rename" && (
        <Sheet open onClose={() => setSheet(null)} title={t("editor.rename")}>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              rename();
            }}
          >
            <label htmlFor={renameId} className="flex justify-between text-sm font-bold">
              <span>{t("create.name")}</span>
              <span className="font-normal tabular-nums text-text-muted">{t("create.nameCount", { count: [...draftName].length, max: SHOWCASE_NAME_MAX })}</span>
            </label>
            <input
              id={renameId}
              value={draftName}
              maxLength={SHOWCASE_NAME_MAX}
              autoComplete="off"
              onChange={(e) => setDraftName(e.currentTarget.value)}
              placeholder={untitled}
              className="min-h-11 rounded-control border border-border bg-surface px-3 text-text placeholder:text-text-muted"
            />
            <p className="text-xs text-text-muted">{t("create.nameHint")}</p>
            <Button type="submit" variant="primary">
              {t("editor.renameSave")}
            </Button>
          </form>
        </Sheet>
      )}

      {sheet === "delete" && (
        <Sheet open onClose={() => setSheet(null)} title={t("editor.delete")}>
          <p className="text-sm">{t("editor.deleteConfirm", { name: displayName })}</p>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" onClick={() => setSheet(null)} disabled={pending}>
              {t("editor.cancel")}
            </Button>
            <Button type="button" variant="primary" onClick={destroy} disabled={pending}>
              {t("editor.deleteYes")}
            </Button>
          </div>
        </Sheet>
      )}
    </LazyMotion>
  );
}
