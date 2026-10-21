import { routing, type Locale } from "@/i18n/routing";

/** Chemin localisé (« as-needed ») : `/wiki` en français, `/en/wiki` en anglais ; `""` ou `/` = accueil. */
export function localePath(path: string, locale: Locale): string {
  const clean = path === "/" ? "" : path;
  if (locale === routing.defaultLocale) return clean || "/";
  return `/${locale}${clean}`;
}

/** Canonique et hreflang (fr, en, x-default = langue par défaut), relatifs à `metadataBase`. */
export function localeAlternates(path: string, locale: Locale, search = "") {
  const suffix = search ? `?${search}` : "";
  const languages: Record<string, string> = Object.fromEntries(routing.locales.map((l) => [l, localePath(path, l) + suffix]));
  languages["x-default"] = localePath(path, routing.defaultLocale) + suffix;
  return { canonical: localePath(path, locale) + suffix, languages };
}
