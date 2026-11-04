import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import fr from "@/messages/fr.json";
import en from "@/messages/en.json";
import { eventGaugeView } from "@/lib/home/event-gauge";
import type { EventGaugeCta } from "./EventGauge";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/server/actions/home", () => ({ eventGaugeAction: vi.fn() }));
vi.mock("../realtime/usePoll", () => ({ usePoll: vi.fn() }));
vi.mock("../motion/MotionPreference", () => ({ useReducedFx: () => false }));
vi.mock("../ui/ButtonLink", async () => {
  const { createElement: h } = await import("react");
  return { ButtonLink: ({ href, children }: { href: string; children: unknown }) => h("a", { href }, children as string) };
});
const { EventGauge } = await import("./EventGauge");

const startsAt = Date.parse("2026-11-04T18:00:00.000Z");
const endsAt = Date.parse("2026-11-10T18:00:00.000Z");
const MESSAGES = { fr, en };

const providerProps = (locale: "fr" | "en") => ({
  locale,
  messages: MESSAGES[locale],
  timeZone: "Europe/Paris",
  onError: (e: Error) => {
    throw e;
  },
  children: null,
});

function render({ now, count, cta = null, locale = "fr" }: { now: number; count: number; cta?: EventGaugeCta; locale?: "fr" | "en" }) {
  const initial = eventGaugeView({ startsAt, endsAt, goal: 20_000, count }, now)!;
  return renderToStaticMarkup(
    createElement(NextIntlClientProvider, providerProps(locale), createElement(EventGauge, { initial, refreshSeconds: 60, serverNow: now, cta })),
  );
}

describe("EventGauge", () => {
  it("annonce le début avant l'event, barre vide", () => {
    const html = render({ now: startsAt - 3_600_000, count: 0 });
    expect(html).toContain("Commence dans");
    expect(html).toContain("scaleX(0)");
  });

  it("montre la progression pendant l'event", () => {
    const html = render({ now: startsAt + 1000, count: 5000 });
    expect(html).toContain("Se termine dans");
    expect(html).toContain("scaleX(0.25)");
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="5000"');
  });

  it("garde le vrai compte au-delà de l'objectif, barre pleine", () => {
    const html = render({ now: startsAt + 1000, count: 25_000 });
    expect(html).toContain("scaleX(1)");
    expect(html).toContain('aria-valuenow="20000"');
    expect(html).toContain("Objectif atteint");
  });

  it("donne le bilan à la fin, sans appel à l'action", () => {
    const missed = render({ now: endsAt, count: 15_000, cta: "invite" });
    expect(missed).toContain("Fin de l&#x27;événement");
    expect(missed).not.toContain("/parrainage");
    expect(render({ now: endsAt, count: 20_000 })).toContain("bravo à tous");
  });

  it("invite à s'inscrire ou à amener des amis selon le visiteur", () => {
    expect(render({ now: startsAt + 1000, count: 0, cta: "signup" })).toContain('href="/inscription"');
    expect(render({ now: startsAt + 1000, count: 0, cta: "invite" })).toContain('href="/parrainage"');
    expect(render({ now: startsAt + 1000, count: 0, cta: null })).not.toContain("<a ");
  });

  it("existe en anglais", () => {
    expect(render({ now: startsAt + 1000, count: 5000, locale: "en" })).toContain("Ends in");
  });
});
