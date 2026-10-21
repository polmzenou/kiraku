import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createTranslator, hasLocale } from "next-intl";
import { ImageResponse } from "next/og";
import { routing } from "@/i18n/routing";
import { OG_IMAGE_SIZE } from "@/lib/seo/open-graph";
import fr from "@/messages/fr.json";
import en from "@/messages/en.json";

// Image de partage (Discord, X, WhatsApp…) : sceau 気楽 et accroche localisée, palette Yoru.
// Route simple plutôt que la convention opengraph-image : son URL interne /fr/… redirigerait.
// Satori ne lit pas le woff2 des polices du site : texte en police par défaut, latin seulement.
export async function GET(_request: Request, { params }: RouteContext<"/[locale]/og-image">) {
  const { locale: raw } = await params;
  const locale = hasLocale(routing.locales, raw) ? raw : routing.defaultLocale;
  const t = createTranslator({ locale, messages: { fr, en }[locale], namespace: "metadata" });
  const seal = await readFile(join(process.cwd(), "public/icons/icon-512.png"));
  const sealSrc = `data:image/png;base64,${seal.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          gap: 64,
          padding: "0 96px",
          background: "#15120F",
          color: "#F1E9DA",
          borderBottom: "12px solid #C8372D",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- rendu Satori, pas du DOM */}
        <img src={sealSrc} width={240} height={240} alt="" style={{ borderRadius: 24 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 680 }}>
          <div style={{ fontSize: 112, fontWeight: 700, letterSpacing: -2 }}>{t("title")}</div>
          <div style={{ fontSize: 44, color: "#D9B556", lineHeight: 1.2 }}>{t("ogTagline")}</div>
        </div>
      </div>
    ),
    { ...OG_IMAGE_SIZE, headers: { "Cache-Control": "public, max-age=86400, s-maxage=604800" } },
  );
}
