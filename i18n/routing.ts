import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["fr", "en"],
  defaultLocale: "fr",
  localePrefix: "as-needed", // /boosters en français, /en/boosters en anglais
});

export type Locale = (typeof routing.locales)[number];
