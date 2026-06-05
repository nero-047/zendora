import "server-only";

import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { isClerkConfigured } from "@/lib/env";

export type AppUser = {
  id: string;
  email: string;
  name: string;
  imageUrl?: string;
};

export const demoUser: AppUser = {
  id: "demo_user_zendora",
  email: "founder@zendora.dev",
  name: "Zendora Founder",
  imageUrl: undefined,
};

export async function requireAppUser(): Promise<AppUser> {
  if (!isClerkConfigured()) {
    return demoUser;
  }

  const session = await auth();

  if (!session.userId) {
    redirect("/sign-in");
  }

  const user = await currentUser();
  const email =
    user?.primaryEmailAddress?.emailAddress ||
    user?.emailAddresses?.[0]?.emailAddress ||
    "merchant@zendora.dev";
  const name =
    user?.fullName ||
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    email.split("@")[0] ||
    "Merchant";

  return {
    id: session.userId,
    email,
    name,
    imageUrl: user?.imageUrl,
  };
}

export async function getOptionalAppUser(): Promise<AppUser | null> {
  if (!isClerkConfigured()) {
    return demoUser;
  }

  const session = await auth();

  if (!session.userId) {
    return null;
  }

  return requireAppUser();
}
