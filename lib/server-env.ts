import "server-only";
import { parseServerEnv, type ServerEnv } from "@/lib/env";

let cached: ServerEnv | null = null;

export function serverEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}
