import type { Kinematics } from "@/lib/acoustic/types";
import {
  AcousticAnalysisError,
  analyzeSignal,
  type AcousticAnalysis,
  type AnalysisErrorCode,
} from "@/lib/acoustic/analyze";

export interface AnalysisJob {
  id: number;
  samples: Float32Array;
  sampleRate: number;
  kinematics: Kinematics | null;
}

export type AnalysisFailure = AnalysisErrorCode | "analysis_failed";

export type AnalysisReply =
  | { id: number; ok: true; analysis: AcousticAnalysis }
  | { id: number; ok: false; error: AnalysisFailure };

export function handleAnalysisJob(job: AnalysisJob): AnalysisReply {
  try {
    return {
      id: job.id,
      ok: true,
      analysis: analyzeSignal({
        samples: job.samples,
        sampleRate: job.sampleRate,
        kinematics: job.kinematics,
      }),
    };
  } catch (error) {
    return {
      id: job.id,
      ok: false,
      error: error instanceof AcousticAnalysisError ? error.code : "analysis_failed",
    };
  }
}
