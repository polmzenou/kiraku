import { useTranslations } from "next-intl";
import { PRESTIGE_ASSETS } from "@/lib/prestige/assets";
import type { PlayerDecor } from "@/lib/profile/decor";
import { PlayerAvatar } from "../social/PlayerAvatar";
import "./prestige.css";

/**
 * En-tête de /prestige, sur l'aube au-dessus d'une mer de nuages : le sceau 転生, l'idée en une phrase, et l'avatar
 * du joueur avec son prochain chiffre en filigrane.
 */
export function PrestigeHero({ prestige, slots, username, image, decor }: { prestige: number; slots: number; username: string; image: string | null; decor: PlayerDecor }) {
  const t = useTranslations("prestige.hero");
  return (
    <header className="pr-hero relative isolate flex flex-col items-center gap-3 px-2 pt-4 pb-2 text-center">
      <picture className="pr-hero-bg">
        <source media="(min-width: 48rem)" srcSet={PRESTIGE_ASSETS.accueil.landscape} />
        <img src={PRESTIGE_ASSETS.accueil.portrait} alt="" decoding="async" draggable={false} />
      </picture>
      <span aria-hidden="true" lang="ja" className="grid h-[4.6rem] w-11 place-items-center rounded-[4px] bg-shu-btn font-seal text-2xl text-washi-paper [writing-mode:vertical-rl]">
        転生
      </span>
      <h1 className="font-heading text-2xl text-balance md:text-3xl">{t("title")}</h1>
      <p className="max-w-[32ch] text-sm text-[#d9cfbe]">{t("subtitle", { slots })}</p>
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
