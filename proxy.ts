import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { type NextFetchEvent, type NextRequest, NextResponse } from "next/server";

import { isClerkConfigured } from "@/lib/env";

const isProtectedRoute = createRouteMatcher(["/dashboard(.*)"]);

const clerkProxy = clerkMiddleware(async (auth, req) => {
  await auth.protect();

  return NextResponse.next({
    request: {
      headers: req.headers,
    },
  });
});

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  if (isClerkConfigured() && isProtectedRoute(request)) {
    return clerkProxy(request, event);
  }

  return NextResponse.next({
    request: {
      headers: request.headers,
    },
  });
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
