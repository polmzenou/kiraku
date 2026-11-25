import { RANK_SEAL, type AchievementRank } from "@/lib/achievements/catalog";
import { RANK_STYLE } from "@/lib/achievements/style";

/** Succès mis en avant, textes déjà traduits (server/profile/progress.ts). */
export type FeaturedAchievementView = {
  key: string;
  rank: AchievementRank;
  name: string;
  desc: string;
  /** « Succès mis en avant », pour les lecteurs d'écran. */
  label: string;
};

/** Sous l'avatar du profil : sceau du rang et nom du succès choisi par le joueur. */
export function FeaturedAchievement({ achievement }: { achievement: FeaturedAchievementView }) {
  const style = RANK_STYLE[achievement.rank];
  return (
    <p title={achievement.desc} className="flex w-[88px] flex-col items-center gap-0.5 text-center">
      <span className="sr-only">{`${achievement.label} : ${achievement.name}. ${achievement.desc}`}</span>
      <span aria-hidden="true" lang="ja" className={`flex size-6 items-center justify-center rounded-full border font-seal text-xs leading-none ${style.seal}`}>
        {RANK_SEAL[achievement.rank]}
      </span>
      <span aria-hidden="true" className={`line-clamp-2 text-[11px] leading-tight font-bold break-words ${style.text}`}>
        {achievement.name}
      </span>
    </p>
  );
}
