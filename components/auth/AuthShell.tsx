import type { ReactNode } from "react";
import { PageShell } from "../PageShell";
import { SealMark } from "../SealMark";

export type AuthPerk = { kanji: string; text: string };

/**
 * Cadre des pages de compte (connexion, inscription) : carte de papier bordée d'un bandeau
 * vermillon (tanzaku), sceau 気楽 et kanji vertical. Sur grand écran, un panneau d'avantages
 * accompagne le formulaire ; sur téléphone, les avantages passent sous le titre, en court.
 */
export function AuthShell({
  kanji,
  title,
  subtitle,
  perks,
  asideTitle,
  notice,
  children,
  footer,
}: {
  kanji: string;
  title: string;
  subtitle: string;
  perks: AuthPerk[];
  asideTitle: string;
  notice?: ReactNode;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <PageShell>
      <div className="mx-auto grid w-full max-w-5xl gap-8 py-4 md:py-10 lg:grid-cols-[minmax(0,1fr)_28rem] lg:items-stretch lg:gap-14">
        <aside className="relative hidden overflow-hidden lacquer rounded-hero p-10 lg:flex lg:flex-col lg:justify-end">
          <span
            aria-hidden="true"
            lang="ja"
            className="pointer-events-none absolute top-6 right-8 font-seal text-[9rem] leading-none text-shu/15 [writing-mode:vertical-rl]"
          >
            {kanji}
          </span>
          <div className="relative flex flex-col gap-6">
            <h2 className="max-w-sm font-title text-3xl font-extrabold leading-tight">{asideTitle}</h2>
            <ul className="flex flex-col gap-4">
              {perks.map((p) => (
                <li key={p.kanji} className="flex items-center gap-3">
                  <SealMark glyphs={p.kanji} size={36} />
                  <span className="text-text-muted">{p.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <section className="relative w-full overflow-hidden lacquer rounded-hero">
          <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1.5 bg-shu-btn" />
          <div className="flex flex-col gap-6 px-5 pt-8 pb-6 sm:px-8">
            <header className="flex items-start gap-4">
              <SealMark glyphs="気楽" size={48} />
              <div className="flex min-w-0 flex-col gap-1">
                <h1 className="font-title text-2xl font-extrabold leading-tight sm:text-3xl">{title}</h1>
                <p className="text-sm text-text-muted">{subtitle}</p>
              </div>
            </header>

            <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-text-muted lg:hidden">
              {perks.map((p) => (
                <li key={p.kanji} className="flex items-center gap-1.5">
                  <span aria-hidden="true" lang="ja" className="font-seal text-sm text-shu">
                    {p.kanji}
                  </span>
                  {p.text}
                </li>
              ))}
            </ul>

            {notice && <div className="rounded-control border border-kin/50 bg-surface-2 px-3 py-2 text-sm">{notice}</div>}

            {children}
          </div>
          <footer className="flex flex-col gap-1 border-t border-dashed border-border px-5 py-4 text-sm text-text-muted sm:px-8">{footer}</footer>
        </section>
      </div>
    </PageShell>
  );
}
