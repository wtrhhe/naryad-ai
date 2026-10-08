import type { Kinematics } from "@/lib/acoustic/types";
import {
  handleAnalysisJob,
  type AnalysisJob,
  type AnalysisReply,
} from "@/lib/acoustic/analysis-protocol";

export interface BackgroundAnalysisInput {
  samples: Float32Array;
  sampleRate: number;
  kinematics: Kinematics | null;
}

let nextJobId = 1;

function runInline(job: AnalysisJob): Promise<AnalysisReply> {
  return Promise.resolve(handleAnalysisJob(job));
}

export function createAnalysisWorker(): Worker | null {
  if (typeof Worker === "undefined") return null;
  try {
    return new Worker(new URL("./analysis.worker.ts", import.meta.url), { type: "module" });
  } catch {
    return null;
  }
}

export function analyzeInBackground(
  input: BackgroundAnalysisInput,
  workerFactory: () => Worker | null = createAnalysisWorker,
): Promise<AnalysisReply> {
  const job: AnalysisJob = { id: nextJobId++, ...input };
  const worker = workerFactory();
  if (!worker) return runInline(job);
  return new Promise((resolve) => {
    const finish = (reply: AnalysisReply | Promise<AnalysisReply>) => {
      worker.terminate();
      resolve(reply);
    };
    worker.addEventListener("message", (event: MessageEvent<AnalysisReply>) => {
      if (event.data.id === job.id) finish(event.data);
    });
    worker.addEventListener("error", () => finish(runInline(job)));
    const copy = job.samples.slice();
    worker.postMessage({ ...job, samples: copy }, [copy.buffer]);
  });
}
