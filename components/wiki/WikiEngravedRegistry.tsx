import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { isFrozen } from "@/lib/account/deletion";
import { getEngravedRegistry } from "@/server/prestige/copies";
import { getCurrentUser } from "@/server/user";
import { PlayerAvatar } from "../social/PlayerAvatar";

// Au-delà, la planche des numéros deviendrait illisible : seuls les numéros sortis sont listés
const GRID_MAX = 100;

/**
 * Registre des gravées d'une carte (fiche wiki) : la planche des numéros de chaque tirage — sortis et encore en jeu,
 * sortis puis recyclés, pas encore sortis — et les détenteurs dont la collection est visible par le lecteur. Personnel
 * au lecteur (confidentialité des détenteurs), rendu sous Suspense hors de la fiche mise en cache.
 */
export async function WikiEngravedRegistry({ cardId }: { cardId: string }) {
  const user = await getCurrentUser();
  const viewer = user && !user.bannedAt && !isFrozen(user) ? user : null;
  const registry = await getEngravedRegistry(viewer?.id ?? null, cardId);
  if (registry.stats.length === 0) return null;
  const t = await getTranslations("wiki.engraved");

  return (
    <section aria-labelledby="engraved-registry" className="flex flex-col gap-4 lacquer rounded-card p-4">
      <header className="flex flex-col gap-1">
        <h2 id="engraved-registry" className="flex items-center gap-2 font-title text-lg font-bold">
          <span aria-hidden="true" lang="ja" className="font-seal text-shu">版</span>
          {t("title")}
        </h2>
        <p className="text-sm text-text-muted">{t("intro")}</p>
      </header>
      {registry.stats.map((s) => {
        const entries = registry.entries.filter((e) => e.printing === s.printing);
        const alive = new Map(entries.map((e) => [e.serial, e]));
        const taken = new Set(s.taken);
        const shown = entries.filter((e) => e.holder !== null);
        const hidden = entries.length - shown.length;
        return (
          <div key={s.printing} className="flex flex-col gap-3">
            <h3 className="flex flex-wrap items-baseline gap-x-2 text-sm font-bold">
              {s.seal && (
                <span lang="ja" className="font-seal text-base text-shu">
                  {s.seal}
                </span>
              )}
              {t("printing", { printing: s.printing })}
              <span className="font-normal text-text-muted">{t("counts", { issued: s.issued, size: s.size, alive: s.alive })}</span>
            </h3>
            {s.size <= GRID_MAX && (
              <ol aria-label={t("boardLabel", { printing: s.printing })} className="grid grid-cols-[repeat(auto-fill,minmax(2.25rem,1fr))] gap-1">
                {Array.from({ length: s.size }, (_, i) => i + 1).map((n) => {
                  const state = alive.has(n) ? "alive" : taken.has(n) ? "gone" : "free";
                  return (
                    <li
                      key={n}
                      className={`grid h-9 place-items-center rounded-[2px] text-xs font-bold tabular-nums ${
                        state === "alive"
                          ? n === 1
                            ? "bg-kin text-sumi"
                            : "bg-shu-btn text-washi-paper"
                          : state === "gone"
                            ? "border border-border text-text-muted line-through"
                            : "border border-dashed border-border text-text-muted/60"
                      }`}
                    >
                      <span aria-hidden="true">{n}</span>
                      <span className="sr-only">{t(`state.${state}`, { serial: n })}</span>
                    </li>
                  );
                })}
              </ol>
            )}
            {entries.length > 0 && (
              <ul className="flex flex-col gap-2">
                {shown.map((e) => (
                  <li key={e.serial} className="flex min-h-11 items-center gap-3 text-sm">
                    <span className="w-12 shrink-0 font-bold tabular-nums text-shu">{t("serial", { serial: e.serial })}</span>
                    <Link href={`/u/${e.holder!.username}`} className="flex min-w-0 items-center gap-2 text-link underline underline-offset-4">
                      <PlayerAvatar username={e.holder!.username} image={e.holder!.image} size={32} frame={e.holder!.decor.frame} prestige={e.holder!.decor.prestige} />
                      <span className="truncate">{e.holder!.username}</span>
                    </Link>
                  </li>
                ))}
                {hidden > 0 && <li className="text-sm text-text-muted">{t("hiddenHolders", { count: hidden })}</li>}
              </ul>
            )}
          </div>
        );
      })}
    </section>
  );
}
