import { BattleSandbox } from "@/components/battle/sandbox/BattleSandbox";
import { requireAdmin } from "@/server/admin";

/** Bac à sable du combat : la nouvelle scène, ses arènes et ses effets, sans base ni réseau. */
export default async function AdminBattleSandboxPage() {
  await requireAdmin();
  return <BattleSandbox />;
}
