import "server-only";
import { awardState } from "@/lib/ennichi/awards";
import { rankBand } from "@/lib/ennichi/rules";
import { prisma } from "../db";
import { ticketCountWith } from "./close-core";
import { pendingCountWith } from "./lanterns-core";
import { banzukeView, freshEnnichiView, iso, type BanzukeRow, type EnnichiView, type RankView } from "./queries";

// Suivi de l'Ennichi dans l'admin (étape 18d, maquette « Tableau de bord ») : la vue de la fête relue sans cache, l'envoi
// de chaque palier atteint, les parrainages de l'édition « À vérifier », le haut du banzuke et l'état du tirage. La
// graine n'est lue qu'après le tirage, comme sur les pages des joueurs.

export type TierSending = { tier: number; served: number; pending: number; finishedAt: string | null };
export type AdminBanzukeRow = BanzukeRow & { prize: RankView | null };
export type EnnichiDrawState = {
  /** Pseudo du membre de l'équipe qui a tiré, null pour le cron de secours. */
  by: string | null;
  seed: string;
  ticketsHash: string | null;
  /** Prix inscrits au tirage : versés, écartés (compte supprimé ou banni), encore à verser. */
  paid: number;
  skipped: number;
  pending: number;
  banzuke: number;
  omikuji: number;
};
export type EnnichiAdminView = {
  view: EnnichiView;
  committedAt: string | null;
  sending: TierSending[];
  /** Parrainages de l'édition dans la file « À vérifier ». */
  held: number;
  /** Tickets de l'omikuji : en direct jusqu'au tirage, puis ceux figés. */
  tickets: number;
  /** Lots de la cagnotte (dépliée). */
  prizes: number;
  banzuke: { final: boolean; total: number; top: AdminBanzukeRow[] };
  draw: EnnichiDrawState | null;
};

const TOP = 10;

export async function ennichiAdminView(locale: string, now = new Date()): Promise<EnnichiAdminView> {
  const view = await freshEnnichiView(locale, now);
  const prizes = view.pool.reduce((s, p) => s + p.count, 0);
  if (view.phase === "off" || !view.startsAt || !view.endsAt || !view.closesAt) {
    return { view, committedAt: null, sending: [], held: 0, tickets: 0, prizes, banzuke: { final: false, total: 0, top: [] }, draw: null };
  }
  const schedule = { startsAt: new Date(view.startsAt), endsAt: new Date(view.endsAt), closesAt: new Date(view.closesAt) };
  const until = now < schedule.closesAt ? now : schedule.closesAt;
  const edition = view.edition;
  const [row, reached, held, bz] = await Promise.all([
    prisma.ennichiDraw.findUnique({ where: { edition }, select: { committedAt: true, drawnAt: true, drawnById: true, seed: true, ticketsHash: true, tickets: true } }),
    prisma.ennichiTierReached.findMany({ where: { edition }, orderBy: { tier: "asc" }, select: { tier: true, served: true, finishedAt: true } }),
    prisma.referral.count({ where: { version: 2, ennichiEdition: edition, heldAt: { not: null }, reviewedAt: null, revokedAt: null } }),
    banzukeView(view, null),
  ]);
  const sending = await Promise.all(
    reached.map(async (r) => ({ tier: r.tier, served: r.served, pending: await pendingCountWith(prisma, { edition, tier: r.tier, schedule }), finishedAt: iso(r.finishedAt) })),
  );
  const top = bz.rows.slice(0, TOP).map((r) => ({ ...r, prize: rankBand(r.rank, view.ranks) }));
  const banzuke = { final: bz.final, total: bz.rows.length, top };

  if (!row?.drawnAt) {
    const tickets = await ticketCountWith(prisma, edition, until, { excludeStaff: view.excludeStaff });
    return { view, committedAt: iso(row?.committedAt), sending, held, tickets, prizes, banzuke, draw: null };
  }
  const [awards, by] = await Promise.all([
    prisma.ennichiAward.findMany({ where: { edition }, select: { kind: true, granted: true } }),
    row.drawnById ? prisma.user.findUnique({ where: { id: row.drawnById }, select: { username: true } }) : null,
  ]);
  const states = awards.map((a) => awardState(a.granted));
  const skipped = states.filter((s) => s === "SKIPPED").length;
  const pending = states.filter((s) => s === "PENDING").length;
  return {
    view,
    committedAt: iso(row.committedAt),
    sending,
    held,
    tickets: Array.isArray(row.tickets) ? row.tickets.length : 0,
    prizes,
    banzuke,
    draw: {
      by: by?.username ?? null,
      seed: row.seed ?? "",
      ticketsHash: row.ticketsHash,
      paid: awards.length - skipped - pending,
      skipped,
      pending,
      banzuke: awards.filter((a) => a.kind === "BANZUKE").length,
      omikuji: awards.filter((a) => a.kind === "OMIKUJI").length,
    },
  };
}
