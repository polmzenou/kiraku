"use client";

import { useRarities, useRaritySeals } from "@/lib/catalog/use-rarities";

import Image from "next/image";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { Link } from "@/i18n/navigation";
import { type Rarity } from "@/lib/catalog/rarity";
import { albumRarities, albumRatio, type Album, type AlbumPage } from "@/lib/collection/albums";
import { loadAlbumPageAction } from "@/server/actions/collection";
import { Button } from "../ui/Button";

// Classes complètes pour que Tailwind les détecte
const RARITY_TEXT: Record<Rarity, string> = {
  COMMON: "text-rarity-common",
  UNCOMMON: "text-rarity-uncommon",
  RARE: "text-rarity-rare",
  EPIC: "text-rarity-epic",
  LEGENDARY: "text-rarity-legendary",
  MYTHIC: "text-rarity-mythic",
};

/** Grille d'albums (une tuile par série), pages suivantes chargées au défilement. */
export function AlbumList({ initial, query }: { initial: AlbumPage; query: Record<string, string> }) {
  const t = useTranslations("collection.albums");
  const [items, setItems] = useState(initial.items);
  const [nextOffset, setNextOffset] = useState(initial.nextOffset);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const sentinel = useRef<HTMLDivElement>(null);

  const loadMore = () => {
    if (nextOffset === null || pending) return;
    startTransition(async () => {
      const res = await loadAlbumPageAction({ query, offset: nextOffset });
      if (!res.ok) {
        setFailed(true);
        return;
      }
      setFailed(false);
      setItems((prev) => [...prev, ...res.items]);
      setNextOffset(res.nextOffset);
    });
  };

  useEffect(() => {
    const el = sentinel.current;
    if (!el || nextOffset === null || failed) return;
    const observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && loadMore(), { rootMargin: "600px" });
    observer.observe(el);
    return () => observer.disconnect();
  });

  return (
    <div className="flex flex-col gap-4">
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((album) => (
          <li key={album.seriesId}>
            <AlbumTile album={album} />
          </li>
        ))}
      </ul>
      {nextOffset !== null && (
        <div ref={sentinel} className="flex justify-center">
          <Button onClick={loadMore} disabled={pending}>
            {pending ? t("loading") : failed ? t("retry") : t("more")}
          </Button>
        </div>
      )}
    </div>
  );
}

function AlbumTile({ album }: { album: Album }) {
  const RARITY_SEAL = useRaritySeals();
  const RARITIES = useRarities();
  const t = useTranslations("collection.albums");
  const tRarity = useTranslations("rarity");
  const format = useFormatter();
  const ratio = albumRatio(album);
  const complete = album.total > 0 && album.owned === album.total;

  return (
    <Link
      href={{ pathname: "/collection", query: { series: album.seriesId } }}
      className="lacquer relative flex min-h-24 items-center gap-3 rounded-card p-3 transition-[border-color] duration-150 hover:border-text-muted/50"
    >
      <span className="relative h-20 w-16 shrink-0 overflow-hidden rounded-fuda bg-surface-2">
        {album.cover && (
          <Image
            src={album.cover}
            alt=""
            fill
            sizes="64px"
            className={`object-cover ${album.owned === 0 ? "opacity-40 grayscale" : ""}`}
          />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-start justify-between gap-2">
          <span className="truncate font-title text-base font-extrabold">{album.title}</span>
          {complete && (
            <span className="shrink-0 rounded-pill bg-kin px-2 py-0.5 text-xs font-bold text-sumi">
              <span aria-hidden="true" lang="ja" className="mr-1 font-seal">
                全
              </span>
              {t("complete")}
            </span>
          )}
        </span>
        <span className="text-sm text-text-muted tabular-nums">
          {t("progress", { owned: album.owned, total: album.total, percent: format.number(ratio, { style: "percent", maximumFractionDigits: 0 }) })}
        </span>
        <span aria-hidden="true" className="h-1 overflow-hidden rounded-pill bg-surface-2">
          <span className="block h-full origin-left rounded-pill bg-shu" style={{ transform: `scaleX(${ratio})` }} />
        </span>
        <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs tabular-nums" aria-label={t("byRarity")}>
          {albumRarities(album.byRarity, RARITIES).map((r) => (
            <li key={r} className={`flex items-center gap-1 ${album.byRarity[r].owned === 0 ? "text-text-muted" : RARITY_TEXT[r]}`}>
              <span aria-hidden="true" lang="ja" className="font-seal">
                {RARITY_SEAL[r]}
              </span>
              <span className="sr-only">{tRarity(r)}</span>
              {album.byRarity[r].owned}/{album.byRarity[r].total}
            </li>
          ))}
        </ul>
      </span>
    </Link>
  );
}
