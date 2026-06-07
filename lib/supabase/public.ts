import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getSupabasePublicConfig } from "@/lib/env";

let publicClient: SupabaseClient | null = null;

export function getSupabasePublic() {
  const config = getSupabasePublicConfig();

  if (!config) {
    throw new Error(
      "Supabase public client is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  if (!publicClient) {
    publicClient = createClient(config.url, config.publishableKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    });
  }

  return publicClient;
}
