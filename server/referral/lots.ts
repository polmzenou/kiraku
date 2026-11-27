import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { localize, parseLocalized } from "@/lib/boosters/types";
import { parseLotItemRow, type LotInput } from "@/lib/economy/lots";
import {
  OTHER_LOT_SETTING_KEYS,
  otherSettingLotIds,
  REFERRAL_LOT_SETTING_KEYS,
  referralLotAccess,
  referralLotUsages,
  type OtherLotSettings,
  type ReferralLotAccess,
  type ReferralLotSettings,
  type ReferralLotUsage,
} from "@/lib/referral/lots";
import { parseSetting, type SettingKey } from "@/lib/settings/defaults";

// Lots du parrainage et de l'Ennichi (lib/referral/lots.ts) relus en base : réglages qui les versent, lots créés depuis
// /admin/parrainage/lots (marqués par leur ligne du journal admin) et usages ailleurs dans le jeu. Relu dans la
// transaction de l'enregistrement : un réglage modifié entre-temps compte.

type Db = PrismaClient | Prisma.TransactionClient;

/** Lignes du journal admin d'un lot créé ou modifié depuis /admin/parrainage/lots. */
export const REFERRAL_LOT_CREATE = "REFERRAL_LOT_CREATE";
export const REFERRAL_LOT_UPDATE = "REFERRAL_LOT_UPDATE";

// Fresques : un lot qu'une fresque verse (fragment, ligne, colonne, complète) sert ailleurs que le parrainage
const ELSEWHERE = {
  select: { missions: true, shopItems: true, expeditionTypes: true, frescoPieceLots: true, frescoRowLots: true, frescoColumnLots: true, frescoCompleteLots: true },
} as const;

type ElsewhereCount = Record<keyof (typeof ELSEWHERE)["select"], number>;

async function settingsWith(db: Db, keys: readonly SettingKey[]): Promise<Record<string, unknown>> {
  const rows = await db.gameSetting.findMany({ where: { key: { in: [...keys] } }, select: { key: true, value: true } });
  return Object.fromEntries(keys.map((k) => [k, parseSetting(k, rows.find((r) => r.key === k)?.value)]));
}

type LotState = { usages: Map<string, ReferralLotUsage[]>; createdHere: Set<string>; otherSettings: Set<string> };

async function lotStateWith(db: Db): Promise<LotState> {
  const [referral, other, created] = await Promise.all([
    settingsWith(db, REFERRAL_LOT_SETTING_KEYS),
    settingsWith(db, OTHER_LOT_SETTING_KEYS),
    db.adminLog.findMany({ where: { action: REFERRAL_LOT_CREATE, targetType: "Lot" }, select: { targetId: true } }),
  ]);
  return {
    usages: referralLotUsages(referral as ReferralLotSettings),
    createdHere: new Set(created.flatMap((l) => (l.targetId ? [l.targetId] : []))),
    otherSettings: otherSettingLotIds(other as OtherLotSettings),
  };
}

const elsewhere = (lotId: string, count: ElsewhereCount, state: LotState) =>
  Object.values(count).some((n) => n > 0) || state.otherSettings.has(lotId);

/** Droit de l'équipe entière sur ce lot (le DEV compris), relu en base. */
export async function referralLotAccessWith(db: Db, lotId: string): Promise<ReferralLotAccess | "NOT_FOUND"> {
  const [state, lot] = await Promise.all([lotStateWith(db), db.lot.findUnique({ where: { id: lotId }, select: { _count: ELSEWHERE } })]);
  if (!lot) return "NOT_FOUND";
  return referralLotAccess({ referral: state.usages.has(lotId), createdHere: state.createdHere.has(lotId), elsewhere: elsewhere(lotId, lot._count, state) });
}

export type ReferralLotRow = {
  id: string;
  name: string;
  active: boolean;
  usages: ReferralLotUsage[];
  access: ReferralLotAccess;
  /** Contenu pour le formulaire de modification. */
  input: LotInput;
};

/** Lots du parrainage et de l'Ennichi, dans l'ordre des réglages, puis ceux créés depuis leur page. */
export async function referralLotRows(db: PrismaClient, locale: string): Promise<ReferralLotRow[]> {
  const state = await lotStateWith(db);
  const ids = [...new Set([...state.usages.keys(), ...state.createdHere])];
  if (ids.length === 0) return [];
  const lots = await db.lot.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      name: true,
      zeni: true,
      active: true,
      items: { orderBy: { id: "asc" }, select: { kind: true, boosterTypeId: true, cardId: true, rarity: true, quantity: true } },
      _count: ELSEWHERE,
    },
  });
  const byId = new Map(lots.map((l) => [l.id, l]));
  return ids.flatMap((id) => {
    const lot = byId.get(id);
    if (!lot) return [];
    const name = parseLocalized(lot.name);
    return [
      {
        id,
        name: localize(name, locale),
        active: lot.active,
        usages: state.usages.get(id) ?? [],
        access: referralLotAccess({ referral: state.usages.has(id), createdHere: state.createdHere.has(id), elsewhere: elsewhere(id, lot._count, state) }),
        input: { id, name, zeni: lot.zeni, active: lot.active, items: lot.items.flatMap((row) => parseLotItemRow(row) ?? []) },
      },
    ];
  });
}
