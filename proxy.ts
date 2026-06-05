import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import type { NextRequest } from "next/server";

import { isClerkConfigured } from "@/lib/env";
import { refreshSupabaseSession } from "@/utils/supabase/proxy";

const isProtectedRoute = createRouteMatcher(["/dashboard(.*)"]);

const clerkProxy = clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }

  return refreshSupabaseSession(req);
});

function demoProxy(request: NextRequest) {
  return refreshSupabaseSession(request);
}

export default isClerkConfigured() ? clerkProxy : demoProxy;

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
