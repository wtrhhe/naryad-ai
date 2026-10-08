import { z } from "zod";

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().default(""),
});

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  AUTH_EMAIL_DOMAIN: z.string().default("naryad.local"),
  AUTH_PIN_PEPPER: z.string().min(32),
  AI_PROVIDER: z.enum(["claude", "ollama", "mock"]).default("claude"),
  ANTHROPIC_API_KEY: z.string().default(""),
  ANTHROPIC_MODEL_SMART: z.string().default("claude-sonnet-5-5"),
  ANTHROPIC_MODEL_FAST: z.string().default("claude-haiku-5-5"),
  OLLAMA_BASE_URL: z.url().default("http://localhost:11434"),
  OLLAMA_MODEL: z.string().default("qwen2.5vl:7b"),
  VAPID_PRIVATE_KEY: z.string().default(""),
  VAPID_SUBJECT: z.string().default("mailto:admin@naryad.local"),
  CRON_SECRET: z.string().default(""),
});

export type PublicEnv = z.infer<typeof publicSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;

function formatIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
}

export function parsePublicEnv(source: Record<string, string | undefined>): PublicEnv {
  const result = publicSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid public environment: ${formatIssues(result.error)}`);
  }
  return result.data;
}

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid server environment: ${formatIssues(result.error)}`);
  }
  return result.data;
}

const aiSchema = serverSchema.pick({
  AI_PROVIDER: true,
  ANTHROPIC_API_KEY: true,
  ANTHROPIC_MODEL_SMART: true,
  ANTHROPIC_MODEL_FAST: true,
  OLLAMA_BASE_URL: true,
  OLLAMA_MODEL: true,
});

export type AiEnv = z.infer<typeof aiSchema>;

export function parseAiEnv(source: Record<string, string | undefined>): AiEnv {
  const result = aiSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid AI environment: ${formatIssues(result.error)}`);
  }
  return result.data;
}
