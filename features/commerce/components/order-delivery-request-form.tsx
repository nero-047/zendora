"use client";

import { FormEvent, useState } from "react";
import { Loader2, Truck } from "lucide-react";

import {
  orderDeliveryRequestTypeLabels,
  orderDeliveryRequestTypes,
} from "@/features/commerce/order-delivery-request";

type DeliveryRequestResponse =
  | {
      ok: true;
      demo?: boolean;
      requestId: string;
    }
  | {
      ok: false;
      error: string;
    };

export function OrderDeliveryRequestForm({
  canRequest,
  orderId,
  storeSlug,
  token,
}: {
  canRequest: boolean;
  orderId: string;
  storeSlug: string;
  token: string;
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
      const response = await fetch(
        `/api/stores/${storeSlug}/orders/${orderId}/delivery-requests`,
        {
          body: JSON.stringify(Object.fromEntries(formData.entries())),
          headers: {
            "Content-Type": "application/json",
          },
          method: "POST",
        },
      );
      const body = (await response.json()) as DeliveryRequestResponse;

      if (!response.ok || !body.ok) {
        setError(body.ok ? "Delivery request is not available." : body.error);
        return;
      }

      form.reset();
      setRequestId(body.requestId);
    } catch {
      setError("Delivery request is not available.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="grid gap-3" onSubmit={handleSubmit}>
      <input name="token" type="hidden" value={token} />
      <label className="grid gap-1 text-sm font-semibold text-slate-700">
        Request type
        <select
          className="field"
          defaultValue="delivery_instructions"
          disabled={!canRequest || pending}
          name="requestType"
        >
          {orderDeliveryRequestTypes.map((requestType) => (
            <option key={requestType} value={requestType}>
              {orderDeliveryRequestTypeLabels[requestType]}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm font-semibold text-slate-700">
        Details
        <textarea
          className="field min-h-24 resize-y"
          disabled={!canRequest || pending}
          maxLength={1200}
          name="message"
          placeholder="Add address changes, delivery notes, or pickup instructions."
          required
        />
      </label>
      {error ? (
        <p aria-live="polite" className="text-sm font-medium text-red-600">
          {error}
        </p>
      ) : null}
      {requestId ? (
        <p aria-live="polite" className="text-sm font-medium text-emerald-700">
          Delivery request received. Reference {requestId}.
        </p>
      ) : null}
      <button
        className="secondary-button w-fit px-4 text-sm disabled:cursor-not-allowed disabled:opacity-55"
        disabled={!canRequest || pending}
        type="submit"
      >
        {pending ? (
          <Loader2 aria-hidden="true" className="animate-spin" size={16} />
        ) : (
          <Truck aria-hidden="true" size={16} />
        )}
        Request delivery update
      </button>
    </form>
  );
}
