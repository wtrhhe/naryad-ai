import { createClient } from "@supabase/supabase-js";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);

export default async function globalSetup() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("E2E needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  }
  if (!LOCAL_HOSTS.has(new URL(url).hostname)) {
    return;
  }
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const results = await Promise.all([
    admin.from("rate_limits").delete().gte("window_start", "1970-01-01"),
    admin.from("login_attempts").delete().gte("attempted_at", "1970-01-01"),
  ]);
  const failure = results.find((result) => result.error);
  if (failure?.error) {
    throw new Error(`Failed to reset sign-in throttling: ${failure.error.message}`);
  }
}
