"use client";

import Image from "next/image";
import { useFormatter, useTranslations } from "next-intl";
import { createContext, useContext, useRef, useState, useTransition, type ReactNode } from "react";
import { adminUserMutationSchema, adjustedValue, MAX_ADMIN_QUANTITY, MAX_ADMIN_VALUE, USER_STATS, type AdminCardCandidate, type AdminUserMutation, type AdminUserResult, type UserStat } from "@/lib/admin/users";
import { MAX_MOVEMENT } from "@/lib/economy/amount";
import { mutateAdminUserAction, searchAdminCards } from "@/server/actions/admin-users";
import { Button } from "../ui/Button";
import { NoteField } from "../ui/NoteField";
import { Field, FormMessage, inputClass, NumberField, SelectField, TextField, Toggle } from "./fields";

type ChangeOf<T> = T extends AdminUserMutation ? Omit<T, "userId" | "reason"> : never;
type Change = ChangeOf<AdminUserMutation>;
type Mode = "SET" | "ADD" | "REMOVE";
type Account = { username: string; role: "USER" | "DEV" | "ADMIN"; banned: boolean; profileVisibility: "PUBLIC" | "FRIENDS" | "PRIVATE"; showCollection: boolean };
type Booster = { id: string; name: string; active: boolean; count: number; pity: number };
const EditorContext = createContext<{ userId: string; reason: string; report: (result: AdminUserResult | "unexpected") => void }>({ userId: "", reason: "", report: () => {} });
const panel = "flex flex-col gap-4 lacquer rounded-card p-4";

function MutationForm({ title, change, children, disabled = false, button }: { title: string; change: Change; children?: ReactNode; disabled?: boolean; button?: string }) {
  const t = useTranslations("admin.users");
  const context = useContext(EditorContext);
  const { userId, reason } = context;
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<AdminUserResult | "unexpected" | null>(null);
  const valid = adminUserMutationSchema.safeParse({ ...change, userId, reason }).success;
  const text = result === "unexpected" ? t("errors.unexpected") : result ? result.ok ? t("saved") : t(`errors.${result.error}`) : "";
  return (
    <form className={panel} onSubmit={(e) => {
      e.preventDefault();
      if (!valid || pending || disabled) return;
      setResult(null);
      startTransition(async () => {
        try { const saved = await mutateAdminUserAction({ ...change, userId, reason }); setResult(saved); context.report(saved); }
        catch { setResult("unexpected"); context.report("unexpected"); }
      });
    }}>
      <h3 className="font-title text-lg font-bold">{title}</h3>
      <fieldset disabled={pending} className="flex min-w-0 flex-col gap-4">{children}</fieldset>
      <FormMessage message={result ? { tone: result !== "unexpected" && result.ok ? "ok" : "error", text } : null} />
      <Button type="submit" variant="primary" disabled={disabled || pending || !valid} className="self-start">{pending ? t("saving") : button ?? t("save")}</Button>
    </form>
  );
}

function AccountForm({ initial, self }: { initial: Account; self: boolean }) {
  const t = useTranslations("admin.users");
  const [draft, setDraft] = useState(initial);
  return (
    <MutationForm title={t("account")} change={{ kind: "account", ...draft }}>
      <TextField label={t("username")} value={draft.username} maxLength={20} onChange={(username) => setDraft({ ...draft, username })} hint={t("usernameHint")} />
      <Field label={t("role")}>
        {(id) => <select id={id} disabled={self} className={inputClass} value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as Account["role"] })}>
          <option value="USER">{t("userRole")}</option><option value="DEV">{t("devRole")}</option><option value="ADMIN">{t("adminRole")}</option>
        </select>}
      </Field>
      {!self && <Toggle label={t("ban")} checked={draft.banned} onChange={(banned) => setDraft({ ...draft, banned })} />}
      {self && <p className="text-xs text-text-muted">{t("selfHint")}</p>}
      <SelectField label={t("visibility")} value={draft.profileVisibility} options={(["PUBLIC", "FRIENDS", "PRIVATE"] as const).map((v) => ({ value: v, label: t(`visibilities.${v}`) }))} onChange={(profileVisibility) => setDraft({ ...draft, profileVisibility })} />
      <Toggle label={t("showCollection")} checked={draft.showCollection} onChange={(showCollection) => setDraft({ ...draft, showCollection })} />
    </MutationForm>
  );
}

/** Rôle Ambassadeur : badge, cadre et couleur verts, stock relevé et pack hebdomadaire. */
function AmbassadorForm({ since }: { since: Date | null }) {
  const t = useTranslations("admin.users");
  const format = useFormatter();
  return (
    <MutationForm title={t("ambassador")} change={{ kind: "ambassador", ambassador: since === null }} button={t(since ? "revokeAmbassador" : "grantAmbassador")}>
      <p className="text-sm">{since ? t("ambassadorSince", { date: format.dateTime(since, { dateStyle: "medium" }) }) : t("notAmbassador")}</p>
      <p className="text-xs text-text-muted">{t("ambassadorHint")}</p>
    </MutationForm>
  );
}

/** Retrait du classement des collectionneurs (et du top de l'accueil), sans toucher au profil. */
function LeaderboardForm({ hiddenSince }: { hiddenSince: Date | null }) {
  const t = useTranslations("admin.users");
  const format = useFormatter();
  return (
    <MutationForm title={t("leaderboard")} change={{ kind: "leaderboard", hidden: hiddenSince === null }} button={t(hiddenSince ? "showInLeaderboard" : "hideFromLeaderboard")}>
      <p className="text-sm">{hiddenSince ? t("leaderboardHiddenSince", { date: format.dateTime(hiddenSince, { dateStyle: "medium" }) }) : t("leaderboardShown")}</p>
      <p className="text-xs text-text-muted">{t("leaderboardHint")}</p>
    </MutationForm>
  );
}

type LeaderboardMalus = { cards: number; mythics: number };

/** Cartes uniques et Mythiques retirées des totaux du joueur dans le classement, sans toucher à sa collection. */
function LeaderboardMalusForm({ initial }: { initial: LeaderboardMalus }) {
  const t = useTranslations("admin.users");
  const [value, setValue] = useState(initial.cards);
  const [mythics, setMythics] = useState(initial.mythics);
  return (
    <MutationForm title={t("leaderboardMalus")} change={{ kind: "leaderboardMalus", value, mythics }}>
      <NumberField label={t("leaderboardMalusCards")} min={0} max={MAX_ADMIN_VALUE} value={value} onChange={setValue} />
      <NumberField label={t("leaderboardMalusMythics")} min={0} max={MAX_ADMIN_VALUE} value={mythics} onChange={setMythics} hint={t("leaderboardMalusHint")} />
    </MutationForm>
  );
}

function ModeField({ value, onChange }: { value: Mode; onChange: (v: Mode) => void }) {
  const t = useTranslations("admin.users");
  return <SelectField label={t("operation")} value={value} onChange={onChange} options={(["SET", "ADD", "REMOVE"] as const).map((v) => ({ value: v, label: t(`modes.${v}`) }))} />;
}

function BalanceForm({ coins }: { coins: number }) {
  const t = useTranslations("admin.users");
  const format = useFormatter();
  const [mode, setMode] = useState<Mode>("SET");
  const [amount, setAmount] = useState(coins);
  let next: number | null = null;
  try { next = adjustedValue(coins, mode, amount); } catch { /* Affiché comme invalide. */ }
  return (
    <MutationForm title={t("coins")} change={{ kind: "coins", mode, amount }} disabled={next === null}>
      <p className="text-sm text-text-muted">{t("currentBalance", { amount: coins })}</p>
      <ModeField value={mode} onChange={(v) => { setMode(v); setAmount(v === "SET" ? coins : 1); }} />
      <NumberField label={t("amount")} min={mode === "SET" ? 0 : 1} max={mode === "SET" ? MAX_ADMIN_VALUE : MAX_MOVEMENT} value={amount} onChange={setAmount} />
      <p className="text-sm font-bold text-kin">{t("after")} {next === null ? "—" : format.number(next)} Zeni</p>
      <p className="text-xs text-text-muted">{t("ledgerHint")}</p>
    </MutationForm>
  );
}

function StatForm({ field, initial }: { field: UserStat; initial: number }) {
  const t = useTranslations("admin.users");
  const [value, setValue] = useState(initial);
  return (
    <MutationForm title={t(`stats.${field}`)} change={{ kind: "stat", field, value }}>
      <NumberField label={t("value")} min={0} max={MAX_ADMIN_VALUE} value={value} onChange={setValue} hint={t(`statHints.${field}`)} />
    </MutationForm>
  );
}

function BoosterForms({ boosters }: { boosters: Booster[] }) {
  const t = useTranslations("admin.users");
  const [id, setId] = useState(boosters[0]?.id ?? "");
  const booster = boosters.find((b) => b.id === id);
  const options = boosters.map((b) => ({ value: b.id, label: `${b.name}${b.active ? "" : ` · ${t("inactive")}`}` }));
  return (
    <section className="flex flex-col gap-4" aria-label={t("boosters")}>
      <SelectField label={t("boosterType")} value={id} onChange={setId} options={options} hint={t("allBoostersHint")} />
      {booster ? <div className="grid gap-4 md:grid-cols-2">
        <BoosterCreditForm key={`credit:${id}:${booster.count}`} booster={booster} />
        <BannerPityForm key={`pity:${id}:${booster.pity}`} booster={booster} />
      </div> : <p className="text-sm text-text-muted">{t("noBoosters")}</p>}
      <ul className="flex flex-wrap gap-2 text-sm">{boosters.filter((b) => b.count > 0).map((b) => <li key={b.id} className="rounded-control border border-border bg-surface px-3 py-2">{b.name} <strong className="ml-1 tabular-nums">×{b.count}</strong></li>)}</ul>
    </section>
  );
}

function BoosterCreditForm({ booster }: { booster: Booster }) {
  const t = useTranslations("admin.users");
  const [mode, setMode] = useState<Mode>("ADD");
  const [amount, setAmount] = useState(1);
  const [message, setMessage] = useState("");
  let next: number | null = null;
  try { next = adjustedValue(booster.count, mode, amount); } catch { /* Quantité refusée. */ }
  return (
    <MutationForm title={t("boosters")} change={{ kind: "booster", boosterTypeId: booster.id, mode, amount, message: mode === "ADD" ? message : "" }} disabled={next === null}>
      <p className="text-sm">{t("boosterCount", { count: booster.count })}</p>
      <ModeField value={mode} onChange={(v) => { setMode(v); setAmount(v === "SET" ? booster.count : 1); }} />
      <NumberField label={t("quantity")} min={mode === "SET" ? 0 : 1} max={mode === "SET" ? MAX_ADMIN_VALUE : MAX_ADMIN_QUANTITY} value={amount} onChange={setAmount} />
      <p className="text-sm font-bold">{t("after")} {next ?? "—"}</p>
      {mode === "ADD" && <NoteField label={t("giftMessage")} placeholder={t("giftMessagePlaceholder")} value={message} onChange={setMessage} />}
    </MutationForm>
  );
}

function BannerPityForm({ booster }: { booster: Booster }) {
  const t = useTranslations("admin.users");
  const [value, setValue] = useState(booster.pity);
  return <MutationForm title={t("bannerPity")} change={{ kind: "bannerPity", boosterTypeId: booster.id, value }}>
    <NumberField label={t("value")} value={value} onChange={setValue} min={0} max={MAX_ADMIN_VALUE} hint={t("bannerPityHint")} />
  </MutationForm>;
}

function CardForm({ initial }: { initial: AdminCardCandidate | null }) {
  const t = useTranslations("admin.users");
  const tRarity = useTranslations("rarity");
  const [query, setQuery] = useState("");
  const [cards, setCards] = useState<AdminCardCandidate[]>([]);
  const [selected, setSelected] = useState(initial);
  const [mode, setMode] = useState<"ADD" | "REMOVE">("ADD");
  const [amount, setAmount] = useState(1);
  const [message, setMessage] = useState("");
  const [searched, setSearched] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const searchVersion = useRef(0);
  return (
    <section id="admin-card-form" className="flex scroll-mt-8 flex-col gap-4">
      <form className="flex flex-col gap-2" onSubmit={(e) => {
        e.preventDefault();
        const version = ++searchVersion.current;
        setFailed(false);
        startTransition(async () => {
          try { const found = await searchAdminCards(query); if (version === searchVersion.current) { setCards(found); setSearched(true); } }
          catch { if (version === searchVersion.current) setFailed(true); }
        });
      }}>
        <label htmlFor="admin-user-card-search" className="text-sm font-bold">{t("cardSearch")}</label>
        <div className="flex gap-2"><input id="admin-user-card-search" className={inputClass} maxLength={100} value={query} onChange={(e) => { setQuery(e.target.value); searchVersion.current++; setCards([]); setSearched(false); }} placeholder={t("cardSearchPlaceholder")} />
          <Button type="submit" disabled={pending || !query.trim()}>{pending ? t("searching") : t("searchButton")}</Button></div>
        <p className="text-xs text-text-muted">{t("cardSearchHint")}</p>
      </form>
      {failed && <p role="alert" className="text-sm text-shu">{t("errors.unexpected")}</p>}
      {searched && cards.length === 0 && <p role="status" className="text-sm text-text-muted">{t("noCards")}</p>}
      {cards.length > 0 && <ul className="grid max-h-80 gap-2 overflow-y-auto sm:grid-cols-2">
        {cards.map((c) => <li key={c.id}><button type="button" aria-pressed={selected?.id === c.id} className={`flex min-h-16 w-full items-center gap-3 rounded-control border p-2 text-left ${selected?.id === c.id ? "border-kin bg-surface-2" : "border-border bg-surface"}`} onClick={() => setSelected(c)}>
          <Image src={c.imageUrl} width={40} height={56} alt="" className="h-14 w-10 rounded object-cover" />
          <span className="min-w-0 text-sm"><strong>{c.name}</strong><span className="block text-xs text-text-muted">{tRarity(c.rarity)} · {c.series}</span></span>
        </button></li>)}
      </ul>}
      <MutationForm title={t("giveCards")} change={{ kind: "card", cardId: selected?.id ?? "", mode, amount, message: mode === "ADD" ? message : "" }} disabled={!selected}>
        {selected ? <div className="flex items-center gap-3"><Image src={selected.imageUrl} width={56} height={80} alt="" className="h-20 w-14 rounded object-cover" /><div><p className="font-bold">{selected.name}</p><p className="text-sm text-text-muted">{tRarity(selected.rarity)} · {selected.series}</p><p className="text-xs text-text-muted">AniList #{selected.anilistId}{selected.rank === null ? ` · ${t("archivedCard")}` : ""}</p></div></div> : <p className="text-sm text-text-muted">{t("selectCard")}</p>}
        <SelectField label={t("operation")} value={mode} onChange={setMode} options={(["ADD", "REMOVE"] as const).map((v) => ({ value: v, label: t(`cardModes.${v}`) }))} />
        <NumberField label={t("quantity")} min={1} max={MAX_ADMIN_QUANTITY} value={amount} onChange={setAmount} />
        <p className="text-xs text-text-muted">{mode === "ADD" ? t("giveCardHint") : t("removeCardHint")}</p>
        {mode === "ADD" && <NoteField label={t("giftMessage")} placeholder={t("giftMessagePlaceholder")} value={message} onChange={setMessage} />}
      </MutationForm>
    </section>
  );
}

function DiscoveryForm({ count, total, minimum }: { count: number; total: number; minimum: number }) {
  const t = useTranslations("admin.users");
  const [value, setValue] = useState(count);
  return <MutationForm title={t("discoveries")} change={{ kind: "discoveries", value }} disabled={value < minimum || value > total}>
    <NumberField label={t("discoveryCount")} value={value} onChange={setValue} min={minimum} max={total} hint={t("discoveryRange", { min: minimum, max: total })} />
    <p className="text-xs text-text-muted">{t("discoveryHint")}</p>
    <Button type="button" onClick={() => setValue(total)} className="self-start">{t("discoverAll")}</Button>
  </MutationForm>;
}

export function UserEditor({ userId, account, ambassadorSince, leaderboardHiddenAt, leaderboardMalus, self, stats, coins, boosters, discoveries, catalogTotal, ownedCatalogCards, selectedCard, sessions }: {
  userId: string; account: Account; ambassadorSince: Date | null; leaderboardHiddenAt: Date | null; leaderboardMalus: LeaderboardMalus; self: boolean; stats: Record<UserStat, number>; coins: number;
  boosters: Booster[]; discoveries: number; catalogTotal: number; ownedCatalogCards: number; selectedCard: AdminCardCandidate | null; sessions: number;
}) {
  const t = useTranslations("admin.users");
  const [reason, setReason] = useState(t("defaultReason"));
  const [lastResult, report] = useState<AdminUserResult | "unexpected" | null>(null);
  return <EditorContext.Provider value={{ userId, reason, report }}>
    <section className="rounded-card border border-border bg-surface-2 p-4">
      <TextField label={t("reason")} value={reason} onChange={setReason} maxLength={300} hint={t("reasonHint")} invalid={!reason.trim()} />
      <FormMessage message={lastResult ? { tone: lastResult !== "unexpected" && lastResult.ok ? "ok" : "error", text: lastResult === "unexpected" ? t("errors.unexpected") : lastResult.ok ? t("saved") : t(`errors.${lastResult.error}`) } : null} />
    </section>
    <div className="grid items-start gap-4 md:grid-cols-2">
      <AccountForm key={JSON.stringify(account)} initial={account} self={self} />
      <AmbassadorForm key={ambassadorSince?.toISOString() ?? "none"} since={ambassadorSince} />
      <LeaderboardForm key={leaderboardHiddenAt?.toISOString() ?? "shown"} hiddenSince={leaderboardHiddenAt} />
      <LeaderboardMalusForm key={`${leaderboardMalus.cards}:${leaderboardMalus.mythics}`} initial={leaderboardMalus} />
      <BalanceForm key={coins} coins={coins} />
      {USER_STATS.map((field) => <StatForm key={`${field}:${stats[field]}`} field={field} initial={stats[field]} />)}
      <DiscoveryForm key={discoveries} count={discoveries} total={catalogTotal} minimum={ownedCatalogCards} />
      <MutationForm title={t("sessions")} change={{ kind: "sessions" }} disabled={self || sessions === 0} button={t("revokeSessions")}>
        <p className="text-sm">{t("sessionCount", { count: sessions })}</p><p className="text-xs text-text-muted">{t("sessionsHint")}</p>
      </MutationForm>
    </div>
    <BoosterForms boosters={boosters} />
    <CardForm key={selectedCard?.id ?? "search"} initial={selectedCard} />
  </EditorContext.Provider>;
}
