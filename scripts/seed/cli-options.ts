import { z } from "zod";

export const DEFAULT_SEED = 20261016;
const DEFAULT_EMAIL_DOMAIN = "naryad.local";
const MIN_SERVICE_KEY_LENGTH = 20;
const MIN_PEPPER_LENGTH = 32;

export type SeedMode = "minimal" | "full";

export type CliOptions = {
  readonly mode: SeedMode;
  readonly seed: number;
  readonly now: Date | null;
};

export type SeedEnv = {
  readonly supabaseUrl: string;
  readonly serviceRoleKey: string;
  readonly pinPepper: string;
  readonly emailDomain: string;
};

const seedSchema = z.string().regex(/^-?[0-9]+$/, "must be an integer");
const nowSchema = z.iso.datetime({ offset: true });

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(MIN_SERVICE_KEY_LENGTH),
  AUTH_PIN_PEPPER: z.string().min(MIN_PEPPER_LENGTH),
  AUTH_EMAIL_DOMAIN: z.string().min(1).default(DEFAULT_EMAIL_DOMAIN),
});

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "value"}: ${issue.message}`)
    .join("; ");
}

export function parseCliArguments(argv: readonly string[]): CliOptions {
  return argv.reduce<CliOptions>(
    (options, argument) => {
      if (argument === "--minimal") return { ...options, mode: "minimal" };
      if (argument.startsWith("--seed=")) {
        const parsed = seedSchema.safeParse(argument.slice("--seed=".length));
        if (!parsed.success) throw new Error(`Invalid --seed: ${formatIssues(parsed.error)}`);
        return { ...options, seed: Number(parsed.data) };
      }
      if (argument.startsWith("--now=")) {
        const parsed = nowSchema.safeParse(argument.slice("--now=".length));
        if (!parsed.success) throw new Error(`Invalid --now: ${formatIssues(parsed.error)}`);
        return { ...options, now: new Date(parsed.data) };
      }
      throw new Error(
        `Unknown argument: ${argument}. Supported: --minimal, --seed=<int>, --now=<ISO date>`,
      );
    },
    { mode: "full", seed: DEFAULT_SEED, now: null },
  );
}

export function parseSeedEnv(source: Readonly<Record<string, string | undefined>>): SeedEnv {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) throw new Error(`Invalid environment: ${formatIssues(parsed.error)}`);
  return {
    supabaseUrl: parsed.data.NEXT_PUBLIC_SUPABASE_URL,
    serviceRoleKey: parsed.data.SUPABASE_SERVICE_ROLE_KEY,
    pinPepper: parsed.data.AUTH_PIN_PEPPER,
    emailDomain: parsed.data.AUTH_EMAIL_DOMAIN,
  };
}
