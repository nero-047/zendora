import { ClerkProvider } from "@clerk/nextjs";

import { isClerkConfigured } from "@/lib/env";

export function AppProviders({ children }: { children: React.ReactNode }) {
  if (!isClerkConfigured()) {
    return <>{children}</>;
  }

  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: "#0f766e",
          colorText: "#0f172a",
          borderRadius: "0.75rem",
        },
      }}
    >
      {children}
    </ClerkProvider>
  );
}
