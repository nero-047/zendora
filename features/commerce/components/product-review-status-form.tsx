"use client";

import { CheckCircle, Loader2 } from "lucide-react";
import { useActionState } from "react";

import { initialActionState } from "@/features/commerce/action-state";
import { updateProductReviewStatusAction } from "@/features/commerce/actions";
import {
  productReviewStatusLabels,
  productReviewStatuses,
} from "@/features/commerce/reviews";
import type { ProductReview } from "@/features/commerce/types";

type ProductReviewStatusFormProps = {
  review: ProductReview;
  storeId: string;
};

export function ProductReviewStatusForm({
  review,
  storeId,
}: ProductReviewStatusFormProps) {
  const [state, formAction, pending] = useActionState(
    updateProductReviewStatusAction.bind(null, storeId, review.id),
    initialActionState,
  );

  return (
    <form action={formAction} className="mt-3 grid gap-3">
      <label className="grid gap-1 text-sm font-semibold text-slate-700">
        Status
        <select
          className="field"
          defaultValue={review.status}
          disabled={pending}
          name="status"
        >
          {productReviewStatuses.map((status) => (
            <option key={status} value={status}>
              {productReviewStatusLabels[status]}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm font-semibold text-slate-700">
        Merchant reply
        <textarea
          className="field min-h-20 resize-y"
          defaultValue={review.merchantReply || ""}
          disabled={pending}
          name="merchantReply"
          placeholder="Public reply shown after approval"
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
        disabled={pending}
        type="submit"
      >
        {pending ? (
          <Loader2 aria-hidden="true" className="animate-spin" size={16} />
        ) : (
          <CheckCircle aria-hidden="true" size={16} />
        )}
        Save review status
      </button>
    </form>
  );
}
