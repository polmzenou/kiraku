import { BattleSandbox } from "@/components/battle/sandbox/BattleSandbox";
import { requireAdminView } from "@/server/admin";

/** Bac à sable du combat : la nouvelle scène, ses arènes et ses effets, sans base ni réseau. */
export default async function AdminBattleSandboxPage() {
  await requireAdminView();
  return <BattleSandbox />;
}
