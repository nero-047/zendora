import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getRequiredSupabasePublicConfig } from "@/utils/supabase/config";

export const createClient = (
  cookieStore: Awaited<ReturnType<typeof cookies>>,
) => {
  const { url, publishableKey } = getRequiredSupabasePublicConfig();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component. This is safe when Proxy refreshes
          // Supabase auth sessions before protected server work.
        }
      },
    },
  });
};
