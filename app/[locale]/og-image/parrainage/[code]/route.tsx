/* eslint-disable @next/next/no-img-element -- rendu Satori (next/og), pas du DOM */
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { ImageResponse } from "next/og";
import { routing } from "@/i18n/routing";
import { normalizeReferralCode } from "@/lib/economy/referral";
import { OG_IMAGE_SIZE } from "@/lib/seo/open-graph";
import { ogFonts, ogSeal, remoteImage } from "@/server/og/assets";
import { referrerByCode } from "@/server/og/data";
import { Backdrop, Chip, FONT, OG, OgAvatar, OgName, Wordmark } from "@/server/og/scene";

const AVATAR = 280;
const TEXT_WIDTH = 690;

/** Taille du pseudo (3 à 20 caractères) : il tient sur une ligne de la colonne de texte. */
const nameSize = (name: string) => Math.max(46, Math.min(92, Math.floor(TEXT_WIDTH / (name.length * 0.74))));

// Aperçu d'un lien d'invitation /i/CODE : « Pseudo veut te parrainer ! » avec son avatar, son cadre et
// la couleur de son pseudo. Code inconnu ou parrain indisponible : invitation générique.
export async function GET(_request: Request, { params }: RouteContext<"/[locale]/og-image/parrainage/[code]">) {
  const { locale: raw, code: rawCode } = await params;
  const locale = hasLocale(routing.locales, raw) ? raw : routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: "metadata" });
  const code = normalizeReferralCode(decodeURIComponent(rawCode));
  const [fonts, seal, referrer] = await Promise.all([ogFonts(), ogSeal(), code ? referrerByCode(code).catch(() => null) : null]);
  const avatar = await remoteImage(referrer?.image);

  return new ImageResponse(
    (
      <Backdrop>
        <div style={{ position: "absolute", top: 44, left: 80, display: "flex" }}>
          <Wordmark seal={seal} size={60} />
        </div>
        <div
          style={{
            position: "absolute",
            top: 40,
            right: 64,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            fontFamily: FONT.seal,
            fontSize: 240,
            lineHeight: 1,
            color: OG.kin,
            opacity: 0.12,
          }}
        >
          <span>招</span>
          <span>待</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 64, padding: "84px 80px 0", width: "100%" }}>
          {referrer ? (
            <OgAvatar username={referrer.username} avatar={avatar} frame={referrer.decor.frame} size={AVATAR} />
          ) : (
            <img src={seal} width={AVATAR - 40} height={AVATAR - 40} alt="" style={{ borderRadius: 40, margin: 20, boxShadow: "0 20px 50px rgba(0,0,0,0.5)" }} />
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 14, width: TEXT_WIDTH }}>
            <div style={{ display: "flex", color: OG.kin, fontSize: 24, fontWeight: 700, letterSpacing: 6, textTransform: "uppercase" }}>{t("ogInviteKicker")}</div>
            {referrer ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <OgName name={referrer.username} color={referrer.decor.nameColor} fontSize={nameSize(referrer.username)} />
                <div style={{ display: "flex", fontFamily: FONT.heading, fontSize: 54, lineHeight: 1.1, color: OG.text }}>{t("ogInviteLine")}</div>
              </div>
            ) : (
              <div style={{ display: "flex", fontFamily: FONT.heading, fontSize: 64, lineHeight: 1.1, color: OG.text }}>{t("inviteTitleGeneric")}</div>
            )}
            <div style={{ display: "flex", fontSize: 26, lineHeight: 1.4, color: OG.muted, marginTop: 4 }}>{t("ogInviteText")}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 14 }}>
              <div
                style={{
                  display: "flex",
                  padding: "14px 30px",
                  borderRadius: 999,
                  background: OG.shuButton,
                  color: OG.washi,
                  fontSize: 28,
                  fontWeight: 700,
                  boxShadow: "0 10px 28px rgba(200,55,45,0.45)",
                }}
              >
                {t("ogInviteCta")}
              </div>
              {referrer && code && <Chip tone="kin">{t("ogInviteCode", { code })}</Chip>}
            </div>
          </div>
        </div>
      </Backdrop>
    ),
    // Avatar, cadre et couleur peuvent changer : une journée de cache partagé
    { ...OG_IMAGE_SIZE, fonts, headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" } },
  );
}
