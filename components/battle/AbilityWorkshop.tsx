"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { Fuda } from "@/components/fuda/Fuda";
import { useRouter } from "@/i18n/navigation";
import { keywordParams, techniqueParams, ultimateParams } from "@/lib/battle/ability-params";
import { abilityPrice, sameKit, type AbilityKind, type AbilityPrices, type Kit } from "@/lib/battle/loadout";
import { KEYWORDS, TECHNIQUES, type Keyword, type Technique } from "@/lib/battle/types";
import type { WorkshopCard } from "@/lib/battle/view";
import { buyAbilityAction, equipAbilitiesAction, type AtelierResult, type BattleActionError } from "@/server/actions/battle";
import { ZeniCoin } from "../layout/ZeniCoin";
import { Button } from "../ui/Button";
import { Sheet } from "../ui/Sheet";
import type { AbilityRules } from "./AbilityGuide";
import { useBattleError } from "./useBattleError";

// Action qui lève (serveur injoignable, panne) : erreur traduite au lieu d'un écran d'erreur
const UNAVAILABLE = { ok: false, error: "UNAVAILABLE" } as const;

export type WorkshopRules = AbilityRules & { abilityPrices: AbilityPrices };

type Slot = { kind: "KEYWORD"; index: number } | { kind: "TECHNIQUE" };
type Offer = { kind: AbilityKind; ability: Keyword | Technique; price: number };

/** Réponse du serveur, plus fraîche que les props jusqu'au rafraîchissement de la page. */
type Fresh = { kit: Kit; bought: (Keyword | Technique)[]; coins: number | null };

/**
 * Atelier d'une carte : ses emplacements (passifs puis technique), et pour l'emplacement touché, ce qui
 * est acquis (équipé gratuitement) puis ce qui s'achète. Le serveur revérifie prix, possession et kit.
 */
export function AbilityWorkshop({ card, coins, rules, onClose }: { card: WorkshopCard; coins: number; rules: WorkshopRules; onClose: () => void }) {
  const t = useTranslations("battle.atelier");
  const tb = useTranslations("battle");
  const format = useFormatter();
  const router = useRouter();
  const battleError = useBattleError();
  const [slot, setSlot] = useState<Slot | null>(card.slots === 0 ? { kind: "TECHNIQUE" } : null);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [fresh, setFresh] = useState<Fresh | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const confirmRef = useRef<HTMLHeadingElement>(null);

  const kit: Kit = fresh?.kit ?? { keywords: card.keywords, technique: card.technique };
  const balance = fresh?.coins ?? coins;
  const ownedKeywords = new Set<Keyword>([...card.owned.keywords, ...(fresh?.bought.filter((a): a is Keyword => (KEYWORDS as readonly string[]).includes(a)) ?? [])]);
  const ownedTechniques = new Set<Technique>([...card.owned.techniques, ...(fresh?.bought.filter((a): a is Technique => (TECHNIQUES as readonly string[]).includes(a)) ?? [])]);
  const modified = !sameKit(kit, card.base);

  useEffect(() => {
    if (offer) confirmRef.current?.focus();
  }, [offer]);

  const errorText = (code: BattleActionError) => (code === "STALE" || code === "NOT_OWNED" ? t(`errors.${code}`) : battleError(code));

  const run = (action: () => Promise<AtelierResult>, done: (res: Extract<AtelierResult, { ok: true }>) => string) =>
    startTransition(async () => {
      setMessage(null);
      const res = await action().catch(() => UNAVAILABLE);
      if (!res.ok) {
        setMessage({ tone: "error", text: errorText(res.error) });
        // Prix changé ou carte partie : la page se relit derrière la feuille, et la liste réaffiche le prix à jour
        if (res.error === "STALE" || res.error === "NOT_OWNED" || res.error === "ALREADY_OWNED") {
          setOffer(null);
          router.refresh();
        }
        return;
      }
      setMessage({ tone: "ok", text: done(res) });
      setOffer(null);
      setSlot(card.slots === 0 ? { kind: "TECHNIQUE" } : null);
      router.refresh();
    });

  const nameOf = (kind: AbilityKind, a: Keyword | Technique) => (kind === "KEYWORD" ? tb(`keywords.${a as Keyword}.name`) : tb(`techniques.${a as Technique}.name`));
  const keywordDesc = (k: Keyword) => tb(`keywords.${k}.desc`, keywordParams(k, rules.keywordValues));
  const techniqueDesc = (tech: Technique) => tb(`techniques.${tech}.desc`, techniqueParams(rules.techniques[tech].value, rules.keywordValues, (n) => format.number(n)));

  const equip = (next: Kit) =>
    run(
      () => equipAbilitiesAction({ cardId: card.cardId, kit: next }),
      (res) => {
        setFresh((f) => ({ kit: res.kit, bought: f?.bought ?? [], coins: f?.coins ?? null }));
        return t("saved");
      },
    );

  const buy = (o: Offer, target: Slot) =>
    run(
      () =>
        buyAbilityAction(
          o.kind === "KEYWORD"
            ? { cardId: card.cardId, kind: "KEYWORD", ability: o.ability, expectedPrice: o.price, slot: target.kind === "KEYWORD" ? target.index : null }
            : { cardId: card.cardId, kind: "TECHNIQUE", ability: o.ability, expectedPrice: o.price, slot: 0 },
        ),
      (res) => {
        setFresh((f) => ({ kit: res.kit, bought: [...(f?.bought ?? []), o.ability], coins: res.coins ?? f?.coins ?? null }));
        return t("bought", { ability: nameOf(o.kind, o.ability) });
      },
    );

  const reset = () =>
    run(
      () => equipAbilitiesAction({ cardId: card.cardId, kit: null }),
      (res) => {
        setFresh((f) => ({ kit: res.kit, bought: f?.bought ?? [], coins: f?.coins ?? null }));
        return t("resetDone");
      },
    );

  // Remplaçants de l'emplacement touché : acquis d'abord, puis à acheter (du moins cher au plus cher)
  const replacements = (() => {
    if (!slot) return null;
    if (slot.kind === "KEYWORD") {
      const current = kit.keywords[slot.index];
      const others = KEYWORDS.filter((k) => !kit.keywords.includes(k));
      return {
        current: nameOf("KEYWORD", current),
        owned: others.filter((k) => ownedKeywords.has(k)).map((k) => ({ ability: k, next: { keywords: kit.keywords.map((x, i) => (i === slot.index ? k : x)), technique: kit.technique } })),
        toBuy: others
          .filter((k) => !ownedKeywords.has(k))
          .map((k) => ({ kind: "KEYWORD" as const, ability: k, price: abilityPrice(rules.abilityPrices, "KEYWORD", k) }))
          .sort((a, b) => a.price - b.price),
      };
    }
    const others = TECHNIQUES.filter((tech) => tech !== kit.technique);
    return {
      current: nameOf("TECHNIQUE", kit.technique),
      owned: others.filter((tech) => ownedTechniques.has(tech)).map((tech) => ({ ability: tech, next: { keywords: [...kit.keywords], technique: tech } })),
      toBuy: others
        .filter((tech) => !ownedTechniques.has(tech))
        .map((tech) => ({ kind: "TECHNIQUE" as const, ability: tech, price: abilityPrice(rules.abilityPrices, "TECHNIQUE", tech) }))
        .sort((a, b) => a.price - b.price),
    };
  })();

  const desc = (kind: AbilityKind, a: Keyword | Technique) => (kind === "KEYWORD" ? keywordDesc(a as Keyword) : techniqueDesc(a as Technique));
  const orbs = (kind: AbilityKind, a: Keyword | Technique) =>
    kind === "TECHNIQUE" ? <span className="shrink-0 text-xs tabular-nums text-text-muted">{tb("board.orbs", { count: rules.techniques[a as Technique].cost })}</span> : null;
  const slotKind: AbilityKind = slot?.kind ?? "KEYWORD";

  return (
    <Sheet open onClose={onClose} title={card.name} wide="xl">
      <div className="flex flex-col gap-4 md:grid md:grid-cols-[13rem_minmax(0,1fr)] md:items-start md:gap-6">
        <div className="flex items-center gap-3 md:flex-col md:items-stretch">
          <div className="w-24 shrink-0 md:w-full">
            <Fuda card={card} size="sm" variant="battle" tilt={false} sizes="(min-width: 768px) 208px, 96px" />
          </div>
          <div className="flex min-w-0 flex-col gap-1 text-sm">
            <p className="flex items-center gap-2 font-bold tabular-nums text-kin">
              <ZeniCoin size={16} />
              {t("balance", { amount: balance })}
            </p>
            <p className="text-text-muted">{t("slotsCount", { count: card.slots })}</p>
            <p className="text-xs text-text-muted">{t("nextBattle")}</p>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <section aria-labelledby="atelier-slots" className="flex flex-col gap-2">
            <h3 id="atelier-slots" className="font-title text-lg font-bold">
              {t("slotsTitle")}
            </h3>
            {card.slots === 0 && <p className="text-sm text-text-muted">{t("noSlot")}</p>}
            <ul className="grid gap-2 sm:grid-cols-2">
              {kit.keywords.map((k, index) => (
                <li key={`${k}-${index}`}>
                  <SlotButton
                    label={t("passiveSlot", { n: index + 1 })}
                    name={nameOf("KEYWORD", k)}
                    desc={keywordDesc(k)}
                    selected={slot?.kind === "KEYWORD" && slot.index === index}
                    disabled={pending}
                    onClick={() => {
                      setOffer(null);
                      setMessage(null);
                      setSlot({ kind: "KEYWORD", index });
                    }}
                  />
                </li>
              ))}
              <li>
                <SlotButton
                  label={t("techniqueSlot")}
                  name={nameOf("TECHNIQUE", kit.technique)}
                  desc={techniqueDesc(kit.technique)}
                  meta={tb("board.orbs", { count: rules.techniques[kit.technique].cost })}
                  selected={slot?.kind === "TECHNIQUE"}
                  disabled={pending}
                  onClick={() => {
                    setOffer(null);
                    setMessage(null);
                    setSlot({ kind: "TECHNIQUE" });
                  }}
                />
              </li>
            </ul>
            {!slot && <p className="text-sm text-text-muted">{t("pickSlot")}</p>}
          </section>

          {card.ultimate && (
            <section aria-labelledby="atelier-ultimate" className="flex flex-col gap-2">
              <h3 id="atelier-ultimate" className="font-title text-lg font-bold">
                {t("ultimateTitle")}
              </h3>
              <div className="flex flex-col gap-0.5 rounded-control border border-kin/40 bg-surface px-3 py-2">
                <span className="text-xs text-text-muted">{t("ultimateLocked")}</span>
                <span className="font-bold text-kin">{tb(`ultimates.${card.ultimate}.name`)}</span>
                <span className="text-xs text-text-muted">
                  {tb(`ultimates.${card.ultimate}.desc`, ultimateParams(rules.ultimates[card.ultimate], (n) => format.number(n)))}
                </span>
              </div>
            </section>
          )}

          {message && (
            <p role={message.tone === "error" ? "alert" : "status"} className={`text-sm font-bold ${message.tone === "error" ? "text-shu" : "text-kin"}`}>
              {message.text}
            </p>
          )}

          {offer && slot ? (
            <section aria-labelledby="atelier-confirm" className="flex flex-col gap-3 rounded-card border border-kin/60 bg-surface p-4">
              <h3 id="atelier-confirm" ref={confirmRef} tabIndex={-1} className="font-title text-lg font-bold outline-none">
                {t("confirmTitle", { ability: nameOf(offer.kind, offer.ability), card: card.name })}
              </h3>
              <p className="text-sm text-text-muted">{desc(offer.kind, offer.ability)}</p>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex flex-col">
                  <dt className="text-text-muted">{t("confirmPrice")}</dt>
                  <dd className="font-bold tabular-nums text-kin">{t("zeni", { amount: offer.price })}</dd>
                </div>
                <div className="flex flex-col">
                  <dt className="text-text-muted">{t("confirmAfter")}</dt>
                  <dd className={`font-bold tabular-nums ${balance >= offer.price ? "" : "text-shu"}`}>
                    {balance >= offer.price ? t("zeni", { amount: balance - offer.price }) : t("confirmMissing", { amount: offer.price - balance })}
                  </dd>
                </div>
              </dl>
              <p className="text-xs text-text-muted">{t("confirmNote", { ability: nameOf(offer.kind, offer.ability), replaced: replacements?.current ?? "" })}</p>
              <div className="grid grid-cols-2 gap-2">
                <Button disabled={pending} onClick={() => setOffer(null)}>
                  {t("cancel")}
                </Button>
                <Button variant="primary" disabled={pending || balance < offer.price} onClick={() => buy(offer, slot)}>
                  {t("confirm")}
                </Button>
              </div>
            </section>
          ) : (
            replacements && (
              <section aria-labelledby="atelier-replace" className="flex flex-col gap-3">
                <h3 id="atelier-replace" className="font-title text-lg font-bold">
                  {t("replacing", { name: replacements.current })}
                </h3>

                <div className="flex flex-col gap-2">
                  <h4 className="text-sm font-bold text-text-muted">{t("owned")}</h4>
                  {replacements.owned.length === 0 ? (
                    <p className="text-sm text-text-muted">{t("ownedEmpty")}</p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {replacements.owned.map((o) => (
                        <OfferRow
                          key={o.ability}
                          name={nameOf(slotKind, o.ability)}
                          desc={desc(slotKind, o.ability)}
                          meta={orbs(slotKind, o.ability)}
                          tag={(slotKind === "KEYWORD" ? card.base.keywords.includes(o.ability as Keyword) : card.base.technique === o.ability) ? t("origin") : t("purchased")}
                        >
                          <Button size="sm" disabled={pending} aria-label={t("equipNamed", { name: nameOf(slotKind, o.ability) })} onClick={() => equip(o.next)}>
                            {t("equip")}
                          </Button>
                        </OfferRow>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <h4 className="text-sm font-bold text-text-muted">{t("toBuy")}</h4>
                  {replacements.toBuy.length === 0 ? (
                    <p className="text-sm text-text-muted">{t("toBuyEmpty")}</p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {replacements.toBuy.map((o) => (
                        <OfferRow key={o.ability} name={nameOf(o.kind, o.ability)} desc={desc(o.kind, o.ability)} meta={orbs(o.kind, o.ability)}>
                          <Button
                            size="sm"
                            variant={balance >= o.price ? "primary" : "secondary"}
                            disabled={pending}
                            aria-label={t("buyNamed", { name: nameOf(o.kind, o.ability), amount: o.price })}
                            onClick={() => {
                              setMessage(null);
                              setOffer(o);
                            }}
                          >
                            <span className="tabular-nums">{t("zeni", { amount: o.price })}</span>
                          </Button>
                        </OfferRow>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            )
          )}

          {modified && (
            <div className="flex flex-col items-start gap-1 border-t border-border pt-4">
              <Button variant="ghost" disabled={pending} onClick={reset}>
                {t("reset")}
              </Button>
              <p className="text-xs text-text-muted">{t("resetHint")}</p>
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}

function SlotButton({
  label,
  name,
  desc,
  meta,
  selected,
  disabled,
  onClick,
}: {
  label: string;
  name: string;
  desc: string;
  meta?: string;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={`flex min-h-11 w-full flex-col gap-0.5 rounded-control border px-3 py-2 text-left transition-[border-color,background-color] active:scale-[.99] disabled:opacity-60 motion-reduce:transition-none ${
        selected ? "border-kin bg-kin/10" : "border-border bg-surface hover:border-text-muted/50"
      }`}
    >
      <span className="flex items-baseline justify-between gap-2 text-xs text-text-muted">
        <span>{label}</span>
        {meta && <span className="tabular-nums">{meta}</span>}
      </span>
      <span className="font-bold">{name}</span>
      <span className="text-xs text-text-muted">{desc}</span>
    </button>
  );
}

function OfferRow({ name, desc, meta, tag, children }: { name: string; desc: string; meta?: ReactNode; tag?: string; children: ReactNode }) {
  return (
    <li className="flex items-center gap-3 rounded-control border border-border bg-surface px-3 py-2">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-bold">{name}</span>
          {tag && <span className="rounded-full bg-surface-2 px-1.5 text-[11px] font-bold text-text-muted">{tag}</span>}
          {meta}
        </p>
        <p className="text-xs text-text-muted">{desc}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </li>
  );
}
