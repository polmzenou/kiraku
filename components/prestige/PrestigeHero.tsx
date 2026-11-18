import { useTranslations } from "next-intl";
import type { PlayerDecor } from "@/lib/profile/decor";
import { PlayerAvatar } from "../social/PlayerAvatar";
import "./prestige.css";

/** En-tête de /prestige : le sceau 転生, l'idée en une phrase, et l'avatar du joueur avec son prochain chiffre en filigrane. */
export function PrestigeHero({ prestige, slots, username, image, decor }: { prestige: number; slots: number; username: string; image: string | null; decor: PlayerDecor }) {
  const t = useTranslations("prestige.hero");
  return (
    <header className="pr-hero relative isolate flex flex-col items-center gap-3 px-2 pt-4 text-center">
      <span aria-hidden="true" lang="ja" className="grid h-[4.6rem] w-11 place-items-center rounded-[4px] bg-shu-btn font-seal text-2xl text-washi-paper [writing-mode:vertical-rl]">
        転生
      </span>
      <h1 className="font-heading text-2xl text-balance md:text-3xl">{t("title")}</h1>
      <p className="max-w-[32ch] text-sm text-text-muted">{t("subtitle", { slots })}</p>
      <div className="flex items-center gap-5 pt-3">
        <PlayerAvatar username={username} image={image} size={64} frame={decor.frame} prestige={prestige} />
        <span aria-hidden="true" className="font-title text-xl font-extrabold text-kin">
          →
        </span>
        <span className="pr-ghost">
          <PlayerAvatar username={username} image={image} size={64} frame={decor.frame} prestige={prestige + 1} />
        </span>
        <span className="sr-only">{t("next", { level: prestige + 1 })}</span>
      </div>
    </header>
  );
}
