import { createClient } from "@supabase/supabase-js";
import type { SeedEnv } from "./cli-options";
import type { SeedGateway } from "./write";

const AUTH_PAGE_SIZE = 1000;

export function createSupabaseGateway(
  env: Pick<SeedEnv, "supabaseUrl" | "serviceRoleKey">,
): SeedGateway {
  const client = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return {
    countRows: async (table) => {
      const { count, error } = await client.from(table).select("*", { count: "exact", head: true });
      if (error) throw new Error(`Cannot read ${table}: ${error.message}`);
      return count ?? 0;
    },
    insert: async (table, rows) => {
      const { error } = await client.from(table).insert([...rows]);
      if (error) throw new Error(error.message);
    },
    createAuthUser: async (email, password) => {
      const { data, error } = await client.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error || !data.user)
        throw new Error(
          `Cannot create auth user ${email}: ${error?.message ?? "no user returned"}`,
        );
      return data.user.id;
    },
    deleteAuthUser: async (id) => {
      const { error } = await client.auth.admin.deleteUser(id);
      if (error) throw new Error(`Cannot delete auth user ${id}: ${error.message}`);
    },
    listAuthEmails: async () => {
      const emails: string[] = [];
      for (let page = 1; ; page += 1) {
        const { data, error } = await client.auth.admin.listUsers({
          page,
          perPage: AUTH_PAGE_SIZE,
        });
        if (error) throw new Error(`Cannot list auth users: ${error.message}`);
        emails.push(...data.users.map((user) => user.email ?? ""));
        if (data.users.length < AUTH_PAGE_SIZE) return emails;
      }
    },
  };
}
