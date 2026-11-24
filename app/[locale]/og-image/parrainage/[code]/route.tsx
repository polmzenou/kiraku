/* eslint-disable @next/next/no-img-element -- rendu Satori (next/og), pas du DOM */
import { hasLocale, type Locale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { ImageResponse } from "next/og";
import { routing } from "@/i18n/routing";
import { boosterWord } from "@/lib/referral/lot-text";
import { parseInviteCode } from "@/lib/referral/codes";
import { REFERRAL_IMAGES } from "@/lib/referral/assets";
import { OG_IMAGE_SIZE } from "@/lib/seo/open-graph";
import { getRarityDefinitions } from "@/server/catalog/rarities";
import type { LotView } from "@/server/economy/lot-view";
import { localImage, ogFonts, ogSeal } from "@/server/og/assets";
import { referrerByCode } from "@/server/og/data";
import { FONT, Wordmark } from "@/server/og/scene";
import { referralV2Rules } from "@/server/referral/deps";
import { referralGifts } from "@/server/referral/queries";
import { getSetting } from "@/server/settings";

// Aperçu d'un lien d'invitation /i/CODE (design « Enveloppe » de l'atelier invitation) : le fond du fil rouge, la
// pochibukuro fermée à droite, « Pseudo t'invite sur Kiraku » et le cadeau de bienvenue en ruban d'or. Code inconnu ou
// parrain indisponible : invitation générique. Aucune donnée personnelle hors du pseudo public du parrain.

const decode = (raw: string) => {
  try {
    return decodeURIComponent(raw);
  } catch {
    return "";
  }
};

/** Le cadeau de bienvenue en une ligne, dans la langue du lien (« 20 boosters Tout anime · 1 booster Jūbako »). */
async function giftLine(lot: LotView | null, locale: Locale): Promise<string | null> {
  if (!lot) return null;
  const [t, rarities] = await Promise.all([getTranslations({ locale, namespace: "referralV2.gifts" }), getRarityDefinitions()]);
  const rarityName = (key: string) => {
    const r = rarities.find((x) => x.key === key);
    return r ? (locale === "en" ? r.nameEn || r.nameFr : r.nameFr) : key;
  };
  const parts = lot.lines.map((l) =>
    l.kind === "BOOSTER"
      ? t("booster", { count: l.quantity, name: boosterWord(l.name) })
      : l.kind === "CARD"
        ? t("card", { count: l.quantity, name: l.name })
        : t("rarityCard", { count: l.quantity, rarity: rarityName(l.rarity) }),
  );
  if (lot.zeni > 0) parts.push(t("zeni", { amount: lot.zeni }));
  return parts.length ? parts.join(" · ") : null;
}

export async function GET(_request: Request, { params }: RouteContext<"/[locale]/og-image/parrainage/[code]">) {
  const { locale: raw, code: rawCode } = await params;
  const locale = hasLocale(routing.locales, raw) ? raw : routing.defaultLocale;
  const code = parseInviteCode(decode(rawCode))?.code ?? null;
  const [t, fonts, seal, background, envelope, referrer, v2] = await Promise.all([
    getTranslations({ locale, namespace: "invite" }),
    ogFonts(),
    ogSeal(),
    localImage(REFERRAL_IMAGES["og-invit"].src),
    localImage(REFERRAL_IMAGES["pochi/fermee"].src, 520),
    code ? referrerByCode(code).catch(() => null) : null,
    getSetting("referral.v2.enabled"),
  ]);
  // Ruban : le cadeau de bienvenue du parrainage v2 (étape 1, côté filleul)
  const gift = v2 ? await giftLine((await referralGifts(await referralV2Rules(), locale, 0)).steps[0]?.referee ?? null, locale).catch(() => null) : null;
  const title = referrer ? t("metaTitle", { name: referrer.username }) : t("metaTitleGeneric");
  const titleSize = title.length > 34 ? 58 : title.length > 26 ? 66 : 76;

  return new ImageResponse(
    (
      <div style={{ position: "relative", display: "flex", width: "100%", height: "100%", background: "#15120F", color: "#F1E9DA", fontFamily: FONT.body }}>
        {background && <img src={background} width={1200} height={630} alt="" style={{ position: "absolute", inset: 0, width: 1200, height: 630 }} />}
        {envelope && (
          <img
            src={envelope}
            width={372}
            height={496}
            alt=""
            style={{ position: "absolute", right: 55, top: 23, width: 372, height: 496, transform: "rotate(-5deg)" }}
          />
        )}
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: 34, padding: "56px 72px" }}>
          <Wordmark seal={seal} size={56} />
          <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 700 }}>
            <div style={{ display: "flex", fontFamily: FONT.heading, fontSize: titleSize, lineHeight: 1.1 }}>{title}</div>
            <div style={{ display: "flex", fontSize: 32, lineHeight: 1.3, color: "#E8DCC6" }}>{t("lead")}</div>
          </div>
          {gift && (
            <div style={{ display: "flex", alignSelf: "flex-start", maxWidth: 700, padding: "12px 28px", borderRadius: 28, background: "#D9B556", color: "#2A1F08", fontSize: 28, fontWeight: 700, lineHeight: 1.2 }}>
              {t("ogRibbon", { gifts: gift })}
            </div>
          )}
        </div>
      </div>
    ),
    // Pseudo, cadre et cadeau peuvent changer : une journée de cache partagé
    { ...OG_IMAGE_SIZE, fonts, headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" } },
  );
}
