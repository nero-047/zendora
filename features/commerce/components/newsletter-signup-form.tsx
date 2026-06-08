"use client";

import { FormEvent, useState } from "react";
import { Loader2, MailPlus, Send } from "lucide-react";

type NewsletterResponse =
  | {
      ok: true;
      demo?: boolean;
      profileId: string;
    }
  | {
      ok: false;
      error: string;
    };

export function NewsletterSignupForm({
  storeName,
  storeSlug,
}: {
  storeName: string;
  storeSlug: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [subscribed, setSubscribed] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubscribed(false);
    setPending(true);

    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      const response = await fetch(`/api/stores/${storeSlug}/newsletter`, {
        body: JSON.stringify({
          acceptsMarketing: true,
          email: formData.get("email"),
          name: formData.get("name") || undefined,
          source: "storefront",
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const body = (await response.json()) as NewsletterResponse;

      if (!response.ok || !body.ok) {
        setError(body.ok ? "Newsletter signup is not available." : body.error);
        return;
      }

      form.reset();
      setSubscribed(true);
    } catch {
      setError("Newsletter signup is not available.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="soft-panel grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-end"
      onSubmit={handleSubmit}
    >
      <div className="sm:col-span-2">
        <span className="status-pill mb-4">
          <MailPlus aria-hidden="true" size={14} />
          Newsletter
        </span>
        <h2 className="text-2xl font-semibold text-slate-950">
          Join the {storeName} list
        </h2>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-2">
          <span className="label">Name</span>
          <input
            autoComplete="name"
            className="field"
            maxLength={80}
            name="name"
            placeholder="Mira Chen"
          />
        </label>

        <label className="grid gap-2">
          <span className="label">Email</span>
          <input
            autoComplete="email"
            className="field"
            maxLength={120}
            name="email"
            placeholder="mira@example.com"
            required
            type="email"
          />
        </label>
      </div>

      <button
        className="primary-button min-h-12 px-4 disabled:cursor-not-allowed disabled:opacity-55"
        disabled={pending}
        type="submit"
      >
        {pending ? (
          <Loader2 aria-hidden="true" className="animate-spin" size={18} />
        ) : (
          <Send aria-hidden="true" size={18} />
        )}
        Subscribe
      </button>

      {error ? (
        <p
          aria-live="polite"
          className="text-sm font-medium text-red-600 sm:col-span-2"
        >
          {error}
        </p>
      ) : null}

      {subscribed ? (
        <p
          aria-live="polite"
          className="text-sm font-medium text-emerald-700 sm:col-span-2"
        >
          Subscribed to {storeName}.
        </p>
      ) : null}
    </form>
  );
}
