import { z } from "zod";

const integrationEnvSchema = z.object({
  INTEGRATION_API_TOKEN: z.string().default(""),
  INTEGRATION_WEBHOOK_URL: z.union([z.url(), z.literal("")]).default(""),
  INTEGRATION_WEBHOOK_SECRET: z.string().default(""),
});

export type IntegrationEnv = z.infer<typeof integrationEnvSchema>;

export function parseIntegrationEnv(source: Record<string, string | undefined>): IntegrationEnv {
  return integrationEnvSchema.parse(source);
}
