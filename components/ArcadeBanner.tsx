import { useTranslations } from "next-intl";
import Image from "next/image";

/** Petit encart de l'accueil, inspiré des halos et de la grille d'Anime Arcade. */
export function ArcadeBanner() {
  const t = useTranslations("arcadePromo");

  return (
    <aside aria-label={t("label")}>
      <a
        href="https://jjkdle-arcade.vercel.app/"
        className="group relative isolate grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 overflow-hidden rounded-xl border border-white/15 bg-[#09090c] px-4 py-3 font-sans text-white transition-colors hover:border-violet-400/50 focus-visible:outline-violet-400 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-x-5 sm:px-5"
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 opacity-70"
          style={{
            backgroundImage:
              "radial-gradient(ellipse at 5% 50%, #7c3aed26, transparent 45%), radial-gradient(ellipse at 95% 50%, #dc26261a, transparent 40%), linear-gradient(#ffffff04 1px, transparent 1px), linear-gradient(90deg, #ffffff04 1px, transparent 1px)",
            backgroundSize: "100% 100%, 100% 100%, 28px 28px, 28px 28px",
          }}
        />

        <span className="flex min-w-0 items-center">
          <Image
            src="/brand/jjk-arcade-logo.png"
            alt="JJK Arcade"
            width={836}
            height={511}
            sizes="(min-width: 640px) 112px, 96px"
            className="h-auto w-24 shrink-0 rounded-md sm:w-28"
          />
        </span>

        <p className="col-span-2 row-start-2 text-[13px] leading-relaxed text-zinc-300 sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:border-l sm:border-white/10 sm:pl-5 sm:text-sm">
          {t("description")}
        </p>

        <span className="col-start-2 row-start-1 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold whitespace-nowrap transition-colors group-hover:border-violet-400/40 group-hover:bg-violet-400/10 sm:col-start-3">
          {t("discover")}
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 17 17 7M7 7h10v10" />
          </svg>
        </span>
      </a>
    </aside>
  );
}
