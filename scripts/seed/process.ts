import type { OrderBundle } from "./assemble";
import type { SeedContext } from "./context";
import { deriveFollowUps } from "./follow-ups";
import { buildHistoryBundle } from "./flow";
import type { OrderSlot } from "./slots-common";

const bySlotTime = (a: OrderSlot, b: OrderSlot): number =>
  a.issuedAtMs - b.issuedAtMs || a.key.localeCompare(b.key);

export function processSlots(
  context: SeedContext,
  initialSlots: readonly OrderSlot[],
): OrderBundle[] {
  const pending = [...initialSlots].sort(bySlotTime);
  const bundles: OrderBundle[] = [];
  for (let slot = pending.shift(); slot !== undefined; slot = pending.shift()) {
    const bundle = buildHistoryBundle(context, slot);
    bundles.push(bundle);
    const followUps = deriveFollowUps(context, bundle);
    if (followUps.length > 0) {
      pending.push(...followUps);
      pending.sort(bySlotTime);
    }
  }
  return bundles;
}
