"use client";

import { createBrowserClient } from "@supabase/ssr";

import { getRequiredSupabasePublicConfig } from "@/utils/supabase/config";

export const createClient = () => {
  const { url, publishableKey } = getRequiredSupabasePublicConfig();

  return createBrowserClient(url, publishableKey);
};
