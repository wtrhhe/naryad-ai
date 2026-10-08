import { createAlignmentEngine, type AlignmentRequest } from "@/lib/ghost/engine";

const scope = self as unknown as DedicatedWorkerGlobalScope;
const engine = createAlignmentEngine();

scope.onmessage = (event: MessageEvent<AlignmentRequest>) => {
  const reply = engine.handle(event.data);
  if (reply) scope.postMessage(reply.response, reply.transfer);
};
