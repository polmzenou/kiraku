import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import { getCharacterBiography } from "@/server/catalog/biography";

export async function WikiBiography({ anilistId }: { anilistId: number }) {
  const [t, biography] = await Promise.all([getTranslations("wiki"), getCharacterBiography(anilistId)]);
  return (
    <section aria-labelledby="wiki-biography-title" className="rounded-xl border border-border bg-surface p-5 md:p-7">
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-text-muted">{t("characterFile")}</p>
      <h2 id="wiki-biography-title" className="text-2xl font-extrabold md:text-3xl">{t("biography")}</h2>
      {biography.status === "ready" ? (
        <div className="mt-5 space-y-4 text-sm leading-7 text-text">
          {biography.text!.split(/\r?\n\s*\r?\n/).map((paragraph, i) => (
            <p key={i} className="whitespace-pre-line break-words">{paragraph}</p>
          ))}
        </div>
      ) : (
        <p role="status" className="mt-4 text-sm leading-6 text-text-muted">
          {t(biography.status === "empty" ? "biographyEmpty" : "biographyUnavailable")}
        </p>
      )}
      <p className="mt-6 border-t border-border pt-4 text-xs leading-5 text-text-muted">{t("biographySource")}</p>
    </section>
  );
}

export function WikiBiographySkeleton() {
  const t = useTranslations("wiki");
  return (
    <section aria-busy="true" className="rounded-xl border border-border bg-surface p-5 md:p-7">
      <h2 className="text-2xl font-extrabold">{t("biography")}</h2>
      <p role="status" className="sr-only">{t("biographyLoading")}</p>
      <div aria-hidden="true" className="mt-5 space-y-3 animate-pulse">
        {["w-full", "w-full", "w-4/5", "w-2/3"].map((width, i) => <div key={i} className={`h-3 rounded-full bg-surface-2 ${width}`} />)}
      </div>
    </section>
  );
}
