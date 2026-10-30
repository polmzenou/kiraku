import { useTranslations } from "next-intl";
import Image from "next/image";

/** Encart JJK Arcade du pied de page (il était en haut de l'accueil) : le logo, une ligne et le lien. */
export function ArcadeFooterLink() {
  const t = useTranslations("arcadePromo");
  return (
    <aside aria-label={t("label")} className="lg:self-start">
      <a
        href="https://jjkdle-arcade.vercel.app/"
        target="_blank"
        rel="noopener noreferrer"
        className="group flex min-h-11 items-center gap-3 rounded-xl border border-border px-3 py-2 transition-colors hover:border-violet-400/50 hover:text-text"
      >
        <Image
          src="/brand/jjk-arcade-logo.webp"
          alt="JJK Arcade"
          width={288}
          height={176}
          sizes="64px"
          className="h-auto w-16 shrink-0 rounded-md bg-[#09090c]"
        />
        <span className="min-w-0 flex-1 leading-relaxed">{t("description")}</span>
        <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-text transition-colors group-hover:text-violet-300">
          {t("discover")} <span aria-hidden="true">↗</span>
        </span>
      </a>
    </aside>
  );
}
