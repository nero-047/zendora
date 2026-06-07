import type {
  AbandonedCheckout,
  AbandonedCheckoutLine,
  AbandonedCheckoutStatus,
} from "@/features/commerce/types";

export const abandonedCheckoutStatusLabels: Record<
  AbandonedCheckoutStatus,
  string
> = {
  open: "Open",
  recovered: "Recovered",
  dismissed: "Dismissed",
};

export function getAbandonedCheckoutRecoveryHref(input: {
  storeSlug: string;
  recoveryToken: string;
}) {
  return `/stores/${encodeURIComponent(input.storeSlug)}/checkout?recovery=${encodeURIComponent(input.recoveryToken)}`;
}

export function summarizeAbandonedCheckoutLines(
  lines: AbandonedCheckoutLine[],
) {
  return lines.reduce(
    (summary, line) => ({
      lineCount: summary.lineCount + 1,
      itemCount: summary.itemCount + line.quantity,
      subtotalCents:
        summary.subtotalCents + line.unitPriceCents * line.quantity,
    }),
    {
      lineCount: 0,
      itemCount: 0,
      subtotalCents: 0,
    },
  );
}

export function canQueueAbandonedCheckoutRecovery(
  checkout: Pick<
    AbandonedCheckout,
    "customerEmail" | "recoveryToken" | "status" | "lines"
  >,
) {
  return Boolean(
    checkout.status === "open" &&
      checkout.customerEmail.trim() &&
      checkout.recoveryToken.trim() &&
      checkout.lines.length > 0,
  );
}
