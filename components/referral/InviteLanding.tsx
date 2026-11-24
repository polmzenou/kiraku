import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { REFERRAL_IMAGES } from "@/lib/referral/assets";
import type { LotView } from "@/server/economy/lot-view";
import { ButtonLink } from "../ui/ButtonLink";
import { LotGifts } from "./LotGifts";
import { ThemedArt } from "./ThemedArt";

// Page d'arrivée d'un lien d'invitation /i/CODE (atelier invitation) : la lettre de washi du parrain avec le cadeau de
// bienvenue (proposition B « Lettre »), ou la carte centrée d'un joueur déjà inscrit (A), sur le fond du fil rouge.

function Backdrop({ children }: { children: ReactNode }) {
  return (
    <section className="relative isolate -mx-4 flex min-h-[calc(100dvh-8rem)] flex-col items-center justify-center gap-5 overflow-hidden px-4 py-10">
      <ThemedArt base="landing-fond" sizes="100vw" priority className="-z-10" />
      {children}
    </section>
  );
}

function Seal({ kanji }: { kanji: string }) {
  return (
    <span aria-hidden="true" lang="ja" className="flex size-11 shrink-0 items-center justify-center rounded-sm bg-shu-btn font-seal text-2xl text-washi-paper">
      {kanji}
    </span>
  );
}

/** Invité ou visiteur : la lettre du parrain, le cadeau versé à l'inscription, puis ouvrir un booster ou s'inscrire. */
export async function InviteLetter({ referrer, lot, multiplier, openHref }: { referrer: string; lot: LotView | null; multiplier: number; openHref: string }) {
  const t = await getTranslations("invite");
  return (
    <Backdrop>
      <article
        className="relative flex w-full max-w-[360px] flex-col gap-3 px-[12%] pt-[14%] pb-[11%] text-[#1f1b17]"
        style={{ borderStyle: "solid", borderWidth: 0, borderImage: `url(${REFERRAL_IMAGES.lettre.src}) 160 fill / 52px / 0 stretch` }}
      >
        <span aria-hidden="true" lang="ja" className="absolute top-[8%] right-[12%] flex size-11 rotate-6 items-center justify-center rounded-full bg-shu-btn font-seal text-xl text-washi-paper shadow-[0_0_0_2px_rgb(248_242_228/0.85),0_0_0_3.5px_#b3261e]">
          招
        </span>
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#6b645a]">{t("eyebrow")}</span>
        <h1 className="max-w-[80%] font-title text-2xl leading-tight font-extrabold text-balance">{t("title", { name: referrer })}</h1>
        <p className="text-sm">{t("lead")}</p>
        {lot && (
          <div className="flex flex-col gap-2 border-t border-dashed border-[#c9bda3] pt-3">
            <span className="text-xs text-[#6b645a]">{t("gift")}</span>
            <LotGifts lot={lot} multiplier={multiplier} className="text-[#1f1b17]" />
            {multiplier > 1 && <span className="self-start rounded-sm bg-shu-btn px-2 text-xs font-bold text-washi-paper">{t("doubled", { factor: multiplier })}</span>}
          </div>
        )}
      </article>
      <div className="flex w-full max-w-[360px] flex-col gap-2">
        <ButtonLink href={openHref} variant="primary">
          {t("open")}
        </ButtonLink>
        <ButtonLink href="/inscription">{t("signup")}</ButtonLink>
        <p className="text-center text-xs text-text-muted">{t("free")}</p>
      </div>
    </Backdrop>
  );
}

/** Joueur déjà inscrit : pas de cadeau, retour à son compte ou invitation de ses propres amis. */
export async function InviteRegistered({ referrer }: { referrer: string }) {
  const t = await getTranslations("invite.registered");
  return (
    <Backdrop>
      <section className="flex w-full max-w-[360px] flex-col gap-3 lacquer rounded-card p-5">
        <Seal kanji="済" />
        <h1 className="font-title text-xl font-extrabold">{t("title")}</h1>
        <p className="text-sm">{t("body", { name: referrer })}</p>
        <div className="flex flex-col gap-2">
          <ButtonLink href="/" variant="primary">
            {t("cta")}
          </ButtonLink>
          <ButtonLink href="/parrainage">{t("invite")}</ButtonLink>
        </div>
      </section>
    </Backdrop>
  );
}

/** Code inconnu, parrain banni ou supprimé : on peut quand même découvrir le jeu. */
export async function InviteUnknown() {
  const t = await getTranslations("invite.unknown");
  return (
    <Backdrop>
      <section className="flex w-full max-w-[360px] flex-col gap-3 lacquer rounded-card p-5">
        <Seal kanji="迷" />
        <h1 className="font-title text-xl font-extrabold">{t("title")}</h1>
        <p className="text-sm">{t("body")}</p>
        <ButtonLink href="/" variant="primary">
          {t("cta")}
        </ButtonLink>
      </section>
    </Backdrop>
  );
}
