import { SignIn } from "@clerk/nextjs";

import { SetupCallout } from "@/components/setup-callout";
import { isClerkConfigured } from "@/lib/env";

export default function SignInPage() {
  return (
    <main className="auth-surface flex min-h-screen items-center justify-center px-6 py-16">
      {isClerkConfigured() ? (
        <SignIn />
      ) : (
        <SetupCallout
          title="Clerk is ready for your keys"
          description="Add the Clerk values from .env.example to .env.local when you want live sign-in. Until then, Zendora uses local fallback access."
        />
      )}
    </main>
  );
}
