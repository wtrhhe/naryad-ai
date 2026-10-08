import { handleAnalysisJob, type AnalysisJob } from "@/lib/acoustic/analysis-protocol";

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.addEventListener("message", (event: MessageEvent<AnalysisJob>) => {
  scope.postMessage(handleAnalysisJob(event.data));
});
