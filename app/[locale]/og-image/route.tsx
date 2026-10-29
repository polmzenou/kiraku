import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { ImageResponse } from "next/og";
import { routing } from "@/i18n/routing";
import { OG_IMAGE_SIZE } from "@/lib/seo/open-graph";
import { ogFonts, ogSeal } from "@/server/og/assets";
import { showcaseCards } from "@/server/og/data";
import { Backdrop, Chip, FONT, FudaFan, OG, Wordmark } from "@/server/og/scene";

// Image de partage du site (Discord, X, WhatsApp…) : sceau et nom Kiraku, accroche localisée, et un
// éventail de fuda vedettes du catalogue. Route simple plutôt que la convention opengraph-image :
// son URL interne /fr/… redirigerait.
// Même image pour tous dans une langue : rendue (Satori, trois lectures en base) une fois par jour
// et gardée dans le cache de Next, au lieu d'être recalculée à chaque aperçu de lien
export const revalidate = 86400;

export async function GET(_request: Request, { params }: RouteContext<"/[locale]/og-image">) {
  const { locale: raw } = await params;
  const locale = hasLocale(routing.locales, raw) ? raw : routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: "metadata" });
  const [fonts, seal, cards] = await Promise.all([ogFonts(), ogSeal(), showcaseCards()]);

  return new ImageResponse(
    (
      <Backdrop>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 30, padding: "0 0 20px 80px", width: cards.length >= 2 ? 690 : 1100 }}>
          <Wordmark seal={seal} size={108} />
          <div style={{ display: "flex", fontFamily: FONT.heading, fontSize: 50, lineHeight: 1.18, color: OG.text, letterSpacing: -0.5 }}>{t("ogTagline")}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            <Chip tone="kin">{t("ogFree")}</Chip>
            <Chip>{t("ogFeatureCollect")}</Chip>
            <Chip>{t("ogFeatureBattle")}</Chip>
          </div>
        </div>
        {cards.length >= 2 && <FudaFan cards={cards} />}
      </Backdrop>
    ),
    { ...OG_IMAGE_SIZE, fonts, headers: { "Cache-Control": "public, max-age=86400, s-maxage=604800" } },
  );
}
