"use client";

import { Loader2, Star } from "lucide-react";
import { useActionState } from "react";

import { initialActionState } from "@/features/commerce/action-state";
import { createProductReviewAction } from "@/features/commerce/actions";

type ProductReviewFormProps = {
  canReview: boolean;
  orderId: string;
  orderItemId: string;
  productId: string;
  productName: string;
  storeSlug: string;
  token: string;
};

export function ProductReviewForm({
  canReview,
  orderId,
  orderItemId,
  productId,
  productName,
  storeSlug,
  token,
}: ProductReviewFormProps) {
  const [state, formAction, pending] = useActionState(
    createProductReviewAction.bind(null, storeSlug, orderId),
    initialActionState,
  );

  return (
    <form action={formAction} className="mt-3 grid gap-3 rounded-[8px] bg-slate-50 p-3">
      <input name="token" type="hidden" value={token} />
      <input name="orderItemId" type="hidden" value={orderItemId} />
      <input name="productId" type="hidden" value={productId} />
      <label className="grid gap-1 text-sm font-semibold text-slate-700">
        Rating for {productName}
        <select
          className="field"
          defaultValue="5"
          disabled={!canReview || pending}
          name="rating"
        >
          <option value="5">5 stars</option>
          <option value="4">4 stars</option>
          <option value="3">3 stars</option>
          <option value="2">2 stars</option>
          <option value="1">1 star</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm font-semibold text-slate-700">
        Title
        <input
          className="field"
          disabled={!canReview || pending}
          name="title"
          placeholder="Short review title"
        />
      </label>
      <label className="grid gap-1 text-sm font-semibold text-slate-700">
        Review
        <textarea
          className="field min-h-24 resize-y"
          disabled={!canReview || pending}
          name="body"
          placeholder="Tell the merchant and future customers what stood out."
        />
      </label>
      {state.message ? (
        <p
          className={
            state.status === "error"
              ? "text-sm font-medium text-red-600"
              : "text-sm font-medium text-emerald-700"
          }
        >
          {state.message}
        </p>
      ) : null}
      <button
        className="secondary-button w-fit px-4 text-sm disabled:cursor-not-allowed disabled:opacity-55"
        disabled={!canReview || pending}
        type="submit"
      >
        {pending ? (
          <Loader2 aria-hidden="true" className="animate-spin" size={16} />
        ) : (
          <Star aria-hidden="true" size={16} />
        )}
        Submit review
      </button>
    </form>
  );
}
