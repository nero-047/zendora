"use client";

import { FormEvent, useState } from "react";
import { Bell, Loader2, Send } from "lucide-react";

import type { Product } from "@/features/commerce/types";

type RestockAlertResponse =
  | {
      ok: true;
      alertId: string;
      demo?: boolean;
    }
  | {
      ok: false;
      error: string;
    };

export function RestockAlertForm({
  product,
  storeSlug,
}: {
  product: Product;
  storeSlug: string;
}) {
  const activeVariants = product.variants.filter(
    (variant) => variant.status === "active",
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitted(false);
    setPending(true);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const variantId = String(formData.get("variantId") || "");

    try {
      const response = await fetch(`/api/stores/${storeSlug}/restock-alerts`, {
        body: JSON.stringify({
          acceptsMarketing: true,
          email: formData.get("email"),
          name: formData.get("name") || undefined,
          productId: product.id,
          variantId: variantId || undefined,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const body = (await response.json()) as RestockAlertResponse;

      if (!response.ok || !body.ok) {
        setError(body.ok ? "Restock alert is not available." : body.error);
        return;
      }

      form.reset();
      setSubmitted(true);
    } catch {
      setError("Restock alert is not available.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="soft-panel mt-5 grid gap-4 p-4" onSubmit={handleSubmit}>
      <div>
        <span className="status-pill mb-3">
          <Bell aria-hidden="true" size={14} />
          Restock alerts
        </span>
        <h2 className="text-xl font-semibold text-slate-950">
          Notify me about {product.name}
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
            placeholder="Nina Brooks"
          />
        </label>

        <label className="grid gap-2">
          <span className="label">Email</span>
          <input
            autoComplete="email"
            className="field"
            maxLength={120}
            name="email"
            placeholder="nina@example.com"
            required
            type="email"
          />
        </label>
      </div>

      {activeVariants.length > 0 ? (
        <label className="grid gap-2">
          <span className="label">
            {activeVariants[0]?.optionName || "Variant"}
          </span>
          <select className="field" name="variantId">
            <option value="">Any available option</option>
            {activeVariants.map((variant) => (
              <option key={variant.id} value={variant.id}>
                {variant.optionValue}
                {variant.sku ? ` / ${variant.sku}` : ""}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {error ? (
        <p aria-live="polite" className="text-sm font-medium text-red-600">
          {error}
        </p>
      ) : null}

      {submitted ? (
        <p aria-live="polite" className="text-sm font-medium text-emerald-700">
          Restock alert saved for {product.name}.
        </p>
      ) : null}

      <button
        className="secondary-button w-full px-4 disabled:cursor-not-allowed disabled:opacity-55"
        disabled={pending}
        type="submit"
      >
        {pending ? (
          <Loader2 aria-hidden="true" className="animate-spin" size={18} />
        ) : (
          <Send aria-hidden="true" size={18} />
        )}
        Notify me
      </button>
    </form>
  );
}
