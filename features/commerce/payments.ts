import type {
  Order,
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

export type OrderFinancialReconciliationStatus =
  | "settled"
  | "open_balance"
  | "over_refunded"
  | "ledger_mismatch"
  | "voided";

export type OrderFinancialReconciliationSeverity =
  | "success"
  | "warning"
  | "critical"
  | "info";

export type OrderFinancialReconciliation = {
  status: OrderFinancialReconciliationStatus;
  severity: OrderFinancialReconciliationSeverity;
  label: string;
  detail: string;
  expectedPaymentCents: number;
  expectedGiftCardCents: number;
  paymentRefundedCents: number;
  giftCardRefundedCents: number;
  netPaymentCents: number;
  netGiftCardCents: number;
  netCollectedCents: number;
  expectedNetCents: number;
  balanceDueCents: number;
  ledgerDeltaCents: number;
  refundableCents: number;
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

export function getOrderFinancialReconciliation(
  order: Pick<
    Order,
    | "status"
    | "paymentStatus"
    | "totalCents"
    | "amountDueCents"
    | "giftCardCents"
    | "refundedCents"
    | "refundableCents"
    | "refunds"
    | "paymentTransactions"
  >,
): OrderFinancialReconciliation {
  const paymentSummary = summarizePaymentTransactions(order.paymentTransactions);
  const expectedPaymentCents = Math.max(
    0,
    order.totalCents - order.giftCardCents,
  );
  const expectedGiftCardCents = Math.max(0, order.giftCardCents);
  const paymentRefundedCents = order.refunds.reduce(
    (sum, refund) => sum + Math.max(0, refund.paymentCents),
    0,
  );
  const giftCardRefundedCents = order.refunds.reduce(
    (sum, refund) => sum + Math.max(0, refund.giftCardCents),
    0,
  );
  const netPaymentCents = Math.max(
    0,
    paymentSummary.capturedCents - paymentSummary.refundedCents,
  );
  const netGiftCardCents = Math.max(
    0,
    expectedGiftCardCents - giftCardRefundedCents,
  );
  const netCollectedCents = netPaymentCents + netGiftCardCents;
  const expectedNetCents = Math.max(0, order.totalCents - order.refundedCents);
  const balanceDueCents = getOrderAmountDueCents({
    amountDueCents: order.amountDueCents,
    giftCardCents: order.giftCardCents,
    paymentStatus: order.paymentStatus,
    totalCents: order.totalCents,
  });
  const ledgerDeltaCents = netCollectedCents - expectedNetCents;
  const refundTotalCents = paymentRefundedCents + giftCardRefundedCents;
  const refundableCents = Math.max(0, order.refundableCents);

  if (order.refundedCents > order.totalCents || refundTotalCents > order.totalCents) {
    return {
      status: "over_refunded",
      severity: "critical",
      label: "Over-refunded",
      detail: "Refund records exceed the original order total.",
      expectedPaymentCents,
      expectedGiftCardCents,
      paymentRefundedCents,
      giftCardRefundedCents,
      netPaymentCents,
      netGiftCardCents,
      netCollectedCents,
      expectedNetCents,
      balanceDueCents,
      ledgerDeltaCents,
      refundableCents,
    };
  }

  if (isPaymentCollectionOpen(order.paymentStatus) && balanceDueCents > 0) {
    return {
      status: "open_balance",
      severity: order.paymentStatus === "authorized" ? "warning" : "critical",
      label: "Open balance",
      detail: "Payment collection is still open for this order.",
      expectedPaymentCents,
      expectedGiftCardCents,
      paymentRefundedCents,
      giftCardRefundedCents,
      netPaymentCents,
      netGiftCardCents,
      netCollectedCents,
      expectedNetCents,
      balanceDueCents,
      ledgerDeltaCents,
      refundableCents,
    };
  }

  if (
    order.paymentStatus === "voided" ||
    (order.status === "cancelled" && netCollectedCents === 0)
  ) {
    return {
      status: "voided",
      severity: "info",
      label: "Voided",
      detail: "No collected tender remains on this cancelled or voided order.",
      expectedPaymentCents,
      expectedGiftCardCents,
      paymentRefundedCents,
      giftCardRefundedCents,
      netPaymentCents,
      netGiftCardCents,
      netCollectedCents,
      expectedNetCents,
      balanceDueCents,
      ledgerDeltaCents,
      refundableCents,
    };
  }

  if (!isPaymentCollectionOpen(order.paymentStatus) && ledgerDeltaCents !== 0) {
    return {
      status: "ledger_mismatch",
      severity: "warning",
      label: "Ledger mismatch",
      detail:
        ledgerDeltaCents > 0
          ? "Collected tender is higher than the expected net order value."
          : "Collected tender is lower than the expected net order value.",
      expectedPaymentCents,
      expectedGiftCardCents,
      paymentRefundedCents,
      giftCardRefundedCents,
      netPaymentCents,
      netGiftCardCents,
      netCollectedCents,
      expectedNetCents,
      balanceDueCents,
      ledgerDeltaCents,
      refundableCents,
    };
  }

  return {
    status: "settled",
    severity: "success",
    label: "Settled",
    detail: "Collected tender matches the expected net order value.",
    expectedPaymentCents,
    expectedGiftCardCents,
    paymentRefundedCents,
    giftCardRefundedCents,
    netPaymentCents,
    netGiftCardCents,
    netCollectedCents,
    expectedNetCents,
    balanceDueCents,
    ledgerDeltaCents,
    refundableCents,
  };
}
