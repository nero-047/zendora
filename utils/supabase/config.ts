import { getSupabasePublicConfig } from "@/lib/env";

export function getRequiredSupabasePublicConfig() {
  const config = getSupabasePublicConfig();

  if (!config) {
    throw new Error(
      "Supabase public env is missing. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  return config;
}
