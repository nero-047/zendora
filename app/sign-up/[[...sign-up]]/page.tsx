import { SignUp } from "@clerk/nextjs";

import { SetupCallout } from "@/components/setup-callout";
import { isClerkConfigured } from "@/lib/env";

export default function SignUpPage() {
  return (
    <main className="auth-surface flex min-h-screen items-center justify-center px-6 py-16">
      {isClerkConfigured() ? (
        <SignUp />
      ) : (
        <SetupCallout
          title="Clerk sign-up is wired"
          description="Create .env.local from .env.example and add Clerk credentials to enable real onboarding and webhook-backed profile sync."
        />
      )}
    </main>
  );
}
