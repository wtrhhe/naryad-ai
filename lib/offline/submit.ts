import { z } from "zod";
import type { ActionResult } from "@/lib/domain/action-result";
import { TRANSITIONS, type WorkOrderStatus } from "@/lib/domain/work-order-machine";
import { transitionInputSchema, type TransitionInput } from "@/lib/domain/work-order-schemas";
import { classifyError, withTimeout } from "@/lib/offline/schedule";

export const SUBMIT_TIMEOUT_MS = 15_000;

export type TransitionDraft = z.input<typeof transitionInputSchema>;

export interface TransitionOutcome {
  status: WorkOrderStatus;
  nextOrderId: string | null;
}

export type SubmitTransitionResult = ActionResult<
  TransitionOutcome & { queued: boolean; clientActionId: string }
>;

export interface SubmitTransitionOptions {
  label?: string | null;
}

export interface SubmitTransitionDeps {
  canQueue: () => boolean;
  isOnline: () => boolean;
  hasPending: (chainKey: string) => Promise<boolean>;
  send: (input: TransitionInput) => Promise<ActionResult<TransitionOutcome>>;
  enqueue: (input: TransitionInput, label: string | null) => Promise<void>;
  newId: () => string;
  now: () => Date;
  timeoutMs?: number;
}

export function optimisticStatus(input: TransitionInput): WorkOrderStatus {
  return TRANSITIONS[input.action].to ?? input.expectedStatus;
}

function prepare(
  draft: TransitionDraft,
  deps: SubmitTransitionDeps,
): ReturnType<typeof transitionInputSchema.safeParse> {
  return transitionInputSchema.safeParse({
    ...draft,
    clientActionId: draft.clientActionId ?? deps.newId(),
    deviceAt: draft.deviceAt ?? deps.now().toISOString(),
  });
}

export async function submitTransitionWith(
  deps: SubmitTransitionDeps,
  draft: TransitionDraft,
  options: SubmitTransitionOptions = {},
): Promise<SubmitTransitionResult> {
  const parsed = prepare(draft, deps);
  if (!parsed.success) {
    return {
      ok: false,
      error: "validation",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }
  const input = parsed.data;
  const clientActionId = input.clientActionId ?? deps.newId();
  const queueable = deps.canQueue();
  const queue = async (): Promise<SubmitTransitionResult> => {
    await deps.enqueue({ ...input, clientActionId }, options.label ?? null);
    return {
      ok: true,
      data: { status: optimisticStatus(input), nextOrderId: null, queued: true, clientActionId },
    };
  };
  if (queueable && (!deps.isOnline() || (await deps.hasPending(input.orderId)))) {
    return queue();
  }
  try {
    const result = await withTimeout(
      deps.send({ ...input, clientActionId }),
      deps.timeoutMs ?? SUBMIT_TIMEOUT_MS,
    );
    if (!result.ok) {
      return result;
    }
    return { ok: true, data: { ...result.data, queued: false, clientActionId } };
  } catch (error) {
    const outcome = classifyError(error, deps.isOnline());
    if (queueable && (outcome.type === "offline" || outcome.type === "retry")) {
      return queue();
    }
    if (outcome.type === "auth") {
      throw error;
    }
    return { ok: false, error: "unavailable" };
  }
}
