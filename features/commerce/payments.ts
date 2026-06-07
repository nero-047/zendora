import type {
  OrderPaymentTransaction,
  PaymentStatus,
  PaymentTransactionStatus,
  PaymentTransactionType,
} from "@/features/commerce/types";

export const paymentTransactionTypeLabels: Record<
  PaymentTransactionType,
  string
> = {
  authorization: "Authorization",
  capture: "Capture",
  refund: "Refund",
  void: "Void",
};

export const paymentTransactionStatusLabels: Record<
  PaymentTransactionStatus,
  string
> = {
  pending: "Pending",
  succeeded: "Succeeded",
  failed: "Failed",
};

export function summarizePaymentTransactions(
  transactions: OrderPaymentTransaction[],
) {
  const succeeded = transactions.filter(
    (transaction) => transaction.status === "succeeded",
  );
  const capturedCents = succeeded
    .filter((transaction) => transaction.type === "capture")
    .reduce((sum, transaction) => sum + transaction.amountCents, 0);
  const refundedCents = succeeded
    .filter((transaction) => transaction.type === "refund")
    .reduce((sum, transaction) => sum + transaction.amountCents, 0);
  const authorizedCents = succeeded
    .filter((transaction) => transaction.type === "authorization")
    .reduce((sum, transaction) => sum + transaction.amountCents, 0);
  const voidedCents = succeeded
    .filter((transaction) => transaction.type === "void")
    .reduce((sum, transaction) => sum + transaction.amountCents, 0);

  return {
    authorizedCents,
    capturedCents,
    refundedCents,
    voidedCents,
    netCapturedCents: Math.max(0, capturedCents - refundedCents),
  };
}

export function getPaymentCaptureAmountCents(input: {
  amountDueCents?: number | null;
  giftCardCents?: number | null;
  totalCents: number;
}) {
  const totalCents = Math.max(0, input.totalCents);

  if (typeof input.amountDueCents === "number" && input.amountDueCents >= 0) {
    return Math.min(totalCents, input.amountDueCents);
  }

  return Math.max(0, totalCents - Math.max(0, input.giftCardCents || 0));
}

export function isPaymentCollectionOpen(status: PaymentStatus | null | undefined) {
  return !status || status === "pending" || status === "authorized";
}

export function getOrderAmountDueCents(input: {
  amountDueCents?: number | null;
  giftCardCents?: number | null;
  paymentStatus?: PaymentStatus | null;
  totalCents: number;
}) {
  if (!isPaymentCollectionOpen(input.paymentStatus)) {
    return 0;
  }

  return getPaymentCaptureAmountCents(input);
}
