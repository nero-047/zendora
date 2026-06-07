import type {
  OrderPaymentTransaction,
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
