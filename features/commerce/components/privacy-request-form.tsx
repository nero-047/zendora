"use client";

import { FormEvent, useState } from "react";
import { Loader2, Send, ShieldCheck } from "lucide-react";

import {
  privacyRequestTypeLabels,
  privacyRequestTypes,
} from "@/features/commerce/privacy-requests";

type PrivacyRequestResponse =
  | {
      ok: true;
      demo?: boolean;
      requestId: string;
    }
  | {
      ok: false;
      error: string;
    };

export function PrivacyRequestForm({
  storeName,
  storeSlug,
}: {
  storeName: string;
  storeSlug: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setRequestId(null);
    setPending(true);

    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      const response = await fetch(`/api/stores/${storeSlug}/privacy-requests`, {
        body: JSON.stringify(Object.fromEntries(formData.entries())),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const body = (await response.json()) as PrivacyRequestResponse;

      if (!response.ok || !body.ok) {
        setError(body.ok ? "Privacy request is not available." : body.error);
        return;
      }

      form.reset();
      setRequestId(body.requestId);
    } catch {
      setError("Privacy request is not available.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="glass-panel grid gap-5 p-5 sm:p-6" onSubmit={handleSubmit}>
      <div>
        <span className="status-pill mb-4">
          <ShieldCheck aria-hidden="true" size={14} />
          Privacy request
        </span>
        <h1 className="text-4xl font-semibold leading-tight text-slate-950">
          Privacy request
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">{storeName}</p>
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

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-2">
          <span className="label">Request type</span>
          <select className="field" defaultValue="access" name="requestType">
            {privacyRequestTypes.map((requestType) => (
              <option key={requestType} value={requestType}>
                {privacyRequestTypeLabels[requestType]}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-2">
          <span className="label">Order ID</span>
          <input
            autoComplete="off"
            className="field"
            maxLength={80}
            name="orderId"
            placeholder="demo-order-1001"
          />
        </label>
      </div>

      <label className="grid gap-2">
        <span className="label">Message</span>
        <textarea
          className="field min-h-32 resize-y"
          maxLength={1200}
          name="message"
          placeholder="Add details that help the merchant locate your data."
        />
      </label>

      {error ? (
        <p aria-live="polite" className="text-sm font-medium text-red-600">
          {error}
        </p>
      ) : null}

      {requestId ? (
        <p
          aria-live="polite"
          className="soft-panel p-4 text-sm font-medium text-emerald-700"
        >
          Privacy request received. Reference {requestId}.
        </p>
      ) : null}

      <button
        className="primary-button w-full px-4 disabled:cursor-not-allowed disabled:opacity-55"
        disabled={pending}
        type="submit"
      >
        {pending ? (
          <Loader2 aria-hidden="true" className="animate-spin" size={18} />
        ) : (
          <Send aria-hidden="true" size={18} />
        )}
        Submit request
      </button>
    </form>
  );
}
