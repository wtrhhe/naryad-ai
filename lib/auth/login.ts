import { z } from "zod";
import { APP_ROLES, type AppRole } from "@/lib/auth/roles";
import {
  derivePinPassword,
  personnelEmail,
  personnelNumberSchema,
  pinSchema,
} from "@/lib/auth/pin";

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_MINUTES = 5;
export const IP_RATE_LIMIT = { maxHits: 30, windowSeconds: 60 } as const;

export const loginInputSchema = z.object({
  personnelNumber: personnelNumberSchema,
  pin: pinSchema,
});

export type LoginErrorCode =
  "invalid_input" | "invalid_credentials" | "locked" | "rate_limited" | "inactive" | "unavailable";

export type LoginResult =
  | { ok: true; role: AppRole }
  | { ok: false; error: LoginErrorCode; lockMinutes?: number; attemptsLeft?: number };

export interface LoginDependencies {
  emailDomain: string;
  pinPepper: string;
  clientIp: string | null;
  hitRateLimit: (bucket: string, maxHits: number, windowSeconds: number) => Promise<boolean>;
  lockSeconds: (personnelNumber: string) => Promise<number>;
  recentFailures: (personnelNumber: string) => Promise<number>;
  recordAttempt: (personnelNumber: string, succeeded: boolean) => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<{ authUserId: string } | null>;
  findEmployeeRole: (authUserId: string) => Promise<{ role: string; isActive: boolean } | null>;
  signOut: () => Promise<void>;
}

const roleSchema = z.enum(APP_ROLES);

function minutesFromSeconds(seconds: number): number {
  return Math.max(1, Math.ceil(seconds / 60));
}

async function failCredentials(number: string, deps: LoginDependencies): Promise<LoginResult> {
  await deps.recordAttempt(number, false);
  const lockSeconds = await deps.lockSeconds(number);
  if (lockSeconds > 0) {
    return { ok: false, error: "locked", lockMinutes: minutesFromSeconds(lockSeconds) };
  }
  const failures = await deps.recentFailures(number);
  return {
    ok: false,
    error: "invalid_credentials",
    attemptsLeft: Math.max(0, MAX_FAILED_ATTEMPTS - failures),
  };
}

async function resolveRole(authUserId: string, deps: LoginDependencies): Promise<LoginResult> {
  const employee = await deps.findEmployeeRole(authUserId);
  const role = roleSchema.safeParse(employee?.role);
  if (!employee || !employee.isActive || !role.success) {
    await deps.signOut();
    return { ok: false, error: "inactive" };
  }
  return { ok: true, role: role.data };
}

export async function authenticateWithPin(
  raw: unknown,
  deps: LoginDependencies,
): Promise<LoginResult> {
  const input = loginInputSchema.safeParse(raw);
  if (!input.success) {
    return { ok: false, error: "invalid_input" };
  }
  const { personnelNumber, pin } = input.data;
  try {
    const ipBucket = `login:ip:${deps.clientIp ?? "unknown"}`;
    if (!(await deps.hitRateLimit(ipBucket, IP_RATE_LIMIT.maxHits, IP_RATE_LIMIT.windowSeconds))) {
      return { ok: false, error: "rate_limited" };
    }
    const lockSeconds = await deps.lockSeconds(personnelNumber);
    if (lockSeconds > 0) {
      return { ok: false, error: "locked", lockMinutes: minutesFromSeconds(lockSeconds) };
    }
    const session = await deps.signInWithPassword(
      personnelEmail(personnelNumber, deps.emailDomain),
      derivePinPassword(personnelNumber, pin, deps.pinPepper),
    );
    if (!session) {
      return await failCredentials(personnelNumber, deps);
    }
    await deps.recordAttempt(personnelNumber, true);
    return await resolveRole(session.authUserId, deps);
  } catch (error) {
    console.error("login failed", error instanceof Error ? error.message : error);
    return { ok: false, error: "unavailable" };
  }
}
