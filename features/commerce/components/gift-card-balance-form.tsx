"use client";

import { FormEvent, useState } from "react";
import { CreditCard, Loader2, Search } from "lucide-react";

import { formatCurrency } from "@/lib/utils";

type GiftCardBalanceResult = {
  balanceCents: number;
  code: string;
  currency: string;
  expiresAt: string | null;
  redeemable: boolean;
  statusLabel: string;
};

type GiftCardBalanceResponse =
  | {
      ok: true;
      card: GiftCardBalanceResult;
    }
  | {
      ok: false;
      error: string;
    };

export function GiftCardBalanceForm({
  storeName,
  storeSlug,
}: {
  storeName: string;
  storeSlug: string;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<GiftCardBalanceResult | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);

    if (!code.trim()) {
      setError("Enter a gift card code.");
      return;
    }

    setPending(true);

    try {
      const response = await fetch(
        `/api/stores/${storeSlug}/gift-cards/balance`,
        {
          body: JSON.stringify({ code }),
          headers: {
            "Content-Type": "application/json",
          },
          method: "POST",
        },
      );
      const body = (await response.json()) as GiftCardBalanceResponse;

      if (!response.ok || !body.ok) {
        setError(body.ok ? "Gift card balance is not available." : body.error);
        return;
      }

      setResult(body.card);
    } catch {
      setError("Gift card balance is not available.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="glass-panel grid gap-5 p-5 sm:p-6" onSubmit={handleSubmit}>
      <div>
        <span className="status-pill mb-4">
          <CreditCard aria-hidden="true" size={14} />
          Balance check
        </span>
        <h1 className="text-4xl font-semibold leading-tight text-slate-950">
          Gift card balance
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">{storeName}</p>
      </div>

      <label className="grid gap-2">
        <span className="label">Gift card code</span>
        <input
          autoComplete="off"
          className="field font-mono tracking-normal"
          maxLength={40}
          name="code"
          onChange={(event) => setCode(event.target.value)}
          placeholder="SUMMER-5000"
          value={code}
        />
      </label>

      {error ? (
        <p aria-live="polite" className="text-sm font-medium text-red-600">
          {error}
        </p>
      ) : null}

      {result ? (
        <div aria-live="polite" className="soft-panel grid gap-4 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-500">
                {result.code}
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {result.statusLabel}
              </p>
            </div>
            <span
              className={`status-pill ${
                result.redeemable
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-slate-200 bg-slate-50 text-slate-600"
              }`}
            >
              {result.redeemable ? "Redeemable" : "Unavailable"}
            </span>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">
              Balance
            </p>
            <p className="mt-1 text-3xl font-semibold text-slate-950">
              {formatCurrency(result.balanceCents, result.currency)}
            </p>
          </div>

          {result.expiresAt ? (
            <p className="text-sm text-slate-600">
              Expires{" "}
              {new Date(result.expiresAt).toLocaleDateString("en-US", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </p>
          ) : null}
        </div>
      ) : null}

      <button
        className="primary-button w-full px-4 disabled:cursor-not-allowed disabled:opacity-55"
        disabled={pending}
        type="submit"
      >
        {pending ? (
          <Loader2 aria-hidden="true" className="animate-spin" size={18} />
        ) : (
          <Search aria-hidden="true" size={18} />
        )}
        Check balance
      </button>
    </form>
  );
}
