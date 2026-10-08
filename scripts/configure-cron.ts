import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const env = z
  .object({
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
    NEXT_PUBLIC_APP_URL: z.url(),
    CRON_SECRET: z.string().min(32),
  })
  .parse(process.env);

const baseUrlArgument = process.argv
  .find((argument) => argument.startsWith("--base-url="))
  ?.split("=")[1];
const baseUrl = z.url().parse(baseUrlArgument ?? env.NEXT_PUBLIC_APP_URL);

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const targets = [
  { name: "deadlines", path: "/api/cron/deadlines" },
  { name: "push", path: "/api/cron/push" },
  { name: "reviews", path: "/api/cron/reviews" },
];

async function configureTargets(): Promise<void> {
  for (const target of targets) {
    const url = new URL(target.path, baseUrl).toString();
    const { error } = await admin.rpc("configure_cron_target", {
      target: target.name,
      target_url: url,
      target_secret: env.CRON_SECRET,
    });
    if (error) {
      throw new Error(`Failed to configure ${target.name}: ${error.message}`);
    }
    console.warn(`Configured ${target.name} -> ${url}`);
  }
}

configureTargets().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
