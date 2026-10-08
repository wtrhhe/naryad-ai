"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { transitionWorkOrder } from "@/app/actions/work-orders";
import { newUuid } from "@/lib/offline/ids";
import { outboxRuntime, type OutboxSnapshot } from "@/lib/offline/runtime";
import {
  submitTransitionWith,
  SUBMIT_TIMEOUT_MS,
  type SubmitTransitionOptions,
  type SubmitTransitionResult,
  type TransitionDraft,
} from "@/lib/offline/submit";
import type { OutboxBlobInput, OutboxItem, OutboxPayload } from "@/lib/offline/types";

export function submitTransition(
  draft: TransitionDraft,
  options: SubmitTransitionOptions = {},
): Promise<SubmitTransitionResult> {
  return submitTransitionWith(
    {
      canQueue: () => outboxRuntime.owner() !== null,
      isOnline: () => navigator.onLine,
      hasPending: (chainKey) => outboxRuntime.hasPending(chainKey),
      send: (input) => transitionWorkOrder(input),
      enqueue: async (input, label) => {
        await outboxRuntime.enqueue({
          kind: "transition",
          id: input.clientActionId,
          chainKey: input.orderId,
          payload: input,
          label,
          createdAt: input.deviceAt,
        });
      },
      newId: () => newUuid(),
      now: () => new Date(),
      timeoutMs: SUBMIT_TIMEOUT_MS,
    },
    draft,
    options,
  );
}

export interface QueueMediaInput {
  kind: "photo" | "audio";
  orderId: string;
  payload: OutboxPayload;
  blobs: readonly OutboxBlobInput[];
  label?: string | null;
}

export function queueMedia(input: QueueMediaInput): Promise<OutboxItem> {
  return outboxRuntime.enqueue({
    kind: input.kind,
    chainKey: input.orderId,
    payload: { ...input.payload, orderId: input.orderId },
    blobs: input.blobs,
    label: input.label ?? null,
  });
}

export function useOutboxState(): OutboxSnapshot {
  return useSyncExternalStore(
    outboxRuntime.subscribe,
    outboxRuntime.getSnapshot,
    outboxRuntime.getServerSnapshot,
  );
}

export function useOfflineAction() {
  const state = useOutboxState();
  const [submitting, setSubmitting] = useState(false);
  const submit = useCallback(async (draft: TransitionDraft, options?: SubmitTransitionOptions) => {
    setSubmitting(true);
    try {
      return await submitTransition(draft, options);
    } finally {
      setSubmitting(false);
    }
  }, []);
  const flush = useCallback(() => outboxRuntime.flush({ force: true }), []);
  return {
    submitTransition: submit,
    queueMedia,
    flush,
    submitting,
    online: state.online,
    pending: state.pending,
  };
}
