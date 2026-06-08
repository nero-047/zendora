"use client";

import { FormEvent, useState } from "react";
import { Loader2, Mail, Send } from "lucide-react";

import {
  storefrontContactReasonLabels,
  storefrontContactReasons,
} from "@/features/commerce/contact";

type ContactResponse =
  | {
      ok: true;
      demo?: boolean;
      ticketId: string;
    }
  | {
      ok: false;
      error: string;
    };

export function ContactForm({
  storeName,
  storeSlug,
}: {
  storeName: string;
  storeSlug: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [ticketId, setTicketId] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setTicketId(null);
    setPending(true);

    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      const response = await fetch(`/api/stores/${storeSlug}/contact`, {
        body: JSON.stringify(Object.fromEntries(formData.entries())),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const body = (await response.json()) as ContactResponse;

      if (!response.ok || !body.ok) {
        setError(body.ok ? "Contact request is not available." : body.error);
        return;
      }

      form.reset();
      setTicketId(body.ticketId);
    } catch {
      setError("Contact request is not available.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="glass-panel grid gap-5 p-5 sm:p-6" onSubmit={handleSubmit}>
      <div>
        <span className="status-pill mb-4">
          <Mail aria-hidden="true" size={14} />
          Customer support
        </span>
        <h1 className="text-4xl font-semibold leading-tight text-slate-950">
          Contact {storeName}
        </h1>
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
            required
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
          <span className="label">Reason</span>
          <select className="field" defaultValue="order" name="reason">
            {storefrontContactReasons.map((reason) => (
              <option key={reason} value={reason}>
                {storefrontContactReasonLabels[reason]}
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
        <span className="label">Subject</span>
        <input
          autoComplete="off"
          className="field"
          maxLength={120}
          name="subject"
          placeholder="Question about my order"
        />
      </label>

      <label className="grid gap-2">
        <span className="label">Message</span>
        <textarea
          className="field min-h-36 resize-y"
          maxLength={1200}
          name="message"
          placeholder="Tell us what you need help with."
          required
        />
      </label>

      {error ? (
        <p aria-live="polite" className="text-sm font-medium text-red-600">
          {error}
        </p>
      ) : null}

      {ticketId ? (
        <p
          aria-live="polite"
          className="soft-panel p-4 text-sm font-medium text-emerald-700"
        >
          Message received. Reference {ticketId}.
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
        Send message
      </button>
    </form>
  );
}
