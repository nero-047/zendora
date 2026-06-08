import { requireAppUser } from "@/features/auth/app-user";
import { csvResponse } from "@/features/commerce/csv-export";
import { getStoreWorkspace } from "@/features/commerce/data";
import {
  orderStatusLabels,
  paymentMethodLabels,
  paymentStatusLabels,
} from "@/features/commerce/order-status";
import {
  getOrderFinancialReconciliation,
  orderFinancialReconciliationStatusLabels,
  paymentTransactionStatusLabels,
  paymentTransactionTypeLabels,
  summarizePaymentTransactions,
} from "@/features/commerce/payments";
import type {
  Order,
  OrderPaymentTransaction,
  PaymentMethod,
} from "@/features/commerce/types";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

type ExportRouteContext = {
  params: Promise<{ storeId: string }>;
};

type PaymentExportRow = {
  section: string;
  metric: string;
  label: string;
  value: string | number;
  count?: number;
  status?: string;
  detail?: string;
  date?: string;
  href?: string;
};

type PaymentTransactionRow = {
  order: Order;
  transaction: OrderPaymentTransaction;
};

type PaymentMethodSummary = {
  method: PaymentMethod;
  provider: string;
  count: number;
  capturedCents: number;
  refundedCents: number;
  authorizedCents: number;
  voidedCents: number;
};

function formatDate(value: string | undefined) {
  return value ? new Date(value).toISOString() : "";
}

function getTransactionDate(transaction: OrderPaymentTransaction) {
  return transaction.processedAt || transaction.createdAt;
}

function getMethodKey(transaction: OrderPaymentTransaction) {
  return `${transaction.paymentMethod}|${transaction.paymentProvider}`;
}

function summarizeByPaymentMethod(transactions: OrderPaymentTransaction[]) {
  const summaries = new Map<string, PaymentMethodSummary>();

  for (const transaction of transactions) {
    if (transaction.status !== "succeeded") {
      continue;
    }

    const key = getMethodKey(transaction);
    const current = summaries.get(key) || {
      method: transaction.paymentMethod,
      provider: transaction.paymentProvider,
      count: 0,
      capturedCents: 0,
      refundedCents: 0,
      authorizedCents: 0,
      voidedCents: 0,
    };

    current.count += 1;

    if (transaction.type === "capture") {
      current.capturedCents += transaction.amountCents;
    }

    if (transaction.type === "refund") {
      current.refundedCents += transaction.amountCents;
    }

    if (transaction.type === "authorization") {
      current.authorizedCents += transaction.amountCents;
    }

    if (transaction.type === "void") {
      current.voidedCents += transaction.amountCents;
    }

    summaries.set(key, current);
  }

  return [...summaries.values()].sort(
    (a, b) =>
      b.capturedCents - b.refundedCents - (a.capturedCents - a.refundedCents) ||
      a.provider.localeCompare(b.provider),
  );
}

export async function GET(_request: Request, context: ExportRouteContext) {
  const { storeId } = await context.params;
  const user = await requireAppUser();
  const workspace = await getStoreWorkspace(user.id, storeId);

  if (!workspace) {
    return new Response("Store not found.", { status: 404 });
  }

  const { store } = workspace;
  const transactionRows: PaymentTransactionRow[] = workspace.orders
    .flatMap((order) =>
      order.paymentTransactions.map((transaction) => ({
        order,
        transaction,
      })),
    )
    .sort(
      (a, b) =>
        new Date(getTransactionDate(b.transaction)).getTime() -
        new Date(getTransactionDate(a.transaction)).getTime(),
    );
  const transactions = transactionRows.map((row) => row.transaction);
  const paymentSummary = summarizePaymentTransactions(transactions);
  const reconciliations = workspace.orders.map((order) => ({
    order,
    reconciliation: getOrderFinancialReconciliation(order),
  }));
  const openBalanceCents = reconciliations.reduce(
    (sum, item) => sum + item.reconciliation.balanceDueCents,
    0,
  );
  const ledgerIssueCount = reconciliations.filter(
    (item) =>
      item.reconciliation.status === "ledger_mismatch" ||
      item.reconciliation.status === "over_refunded",
  ).length;
  const rows: PaymentExportRow[] = [
    {
      section: "payment_summary",
      metric: "net_captured",
      label: "Net captured",
      value: formatCurrency(paymentSummary.netCapturedCents, store.currency),
      count: transactions.length,
      detail: `${formatCurrency(
        paymentSummary.capturedCents,
        store.currency,
      )} captured / ${formatCurrency(
        paymentSummary.refundedCents,
        store.currency,
      )} refunded`,
    },
    {
      section: "payment_summary",
      metric: "authorized",
      label: "Authorized",
      value: formatCurrency(paymentSummary.authorizedCents, store.currency),
    },
    {
      section: "payment_summary",
      metric: "voided",
      label: "Voided",
      value: formatCurrency(paymentSummary.voidedCents, store.currency),
    },
    {
      section: "payment_summary",
      metric: "open_balance",
      label: "Open balance",
      value: formatCurrency(openBalanceCents, store.currency),
      count: reconciliations.filter(
        (item) => item.reconciliation.status === "open_balance",
      ).length,
    },
    {
      section: "payment_summary",
      metric: "ledger_issues",
      label: "Ledger issues",
      value: ledgerIssueCount,
    },
    ...summarizeByPaymentMethod(transactions).map((summary) => ({
      section: "payment_method",
      metric: `${summary.method}:${summary.provider}`,
      label: paymentMethodLabels[summary.method],
      value: formatCurrency(
        Math.max(0, summary.capturedCents - summary.refundedCents),
        store.currency,
      ),
      count: summary.count,
      detail: [
        summary.provider,
        `${formatCurrency(summary.capturedCents, store.currency)} captured`,
        `${formatCurrency(summary.refundedCents, store.currency)} refunded`,
        `${formatCurrency(summary.authorizedCents, store.currency)} authorized`,
        `${formatCurrency(summary.voidedCents, store.currency)} voided`,
      ].join(" / "),
    })),
    ...transactionRows.map(({ order, transaction }) => ({
      section: "payment_transaction",
      metric: transaction.id,
      label: paymentTransactionTypeLabels[transaction.type],
      value: formatCurrency(transaction.amountCents, transaction.currency),
      count: undefined,
      status: paymentTransactionStatusLabels[transaction.status],
      detail: [
        paymentMethodLabels[transaction.paymentMethod],
        transaction.paymentProvider,
        transaction.providerReference,
        order.customerEmail,
        orderStatusLabels[order.status],
        paymentStatusLabels[order.paymentStatus],
      ]
        .filter(Boolean)
        .join(" / "),
      date: formatDate(getTransactionDate(transaction)),
      href: `/dashboard/stores/${store.id}/orders/${order.id}`,
    })),
    ...reconciliations.map(({ order, reconciliation }) => ({
      section: "order_financial",
      metric: order.id,
      label: order.customerName || order.customerEmail,
      value: formatCurrency(reconciliation.netCollectedCents, order.currency),
      status: orderFinancialReconciliationStatusLabels[reconciliation.status],
      detail: [
        reconciliation.detail,
        `${formatCurrency(
          reconciliation.balanceDueCents,
          order.currency,
        )} balance due`,
        `${formatCurrency(
          reconciliation.ledgerDeltaCents,
          order.currency,
        )} ledger delta`,
        `${formatCurrency(
          reconciliation.refundableCents,
          order.currency,
        )} refundable`,
      ].join(" / "),
      date: formatDate(order.paidAt || order.createdAt),
      href: `/dashboard/stores/${store.id}/orders/${order.id}`,
    })),
  ];

  return csvResponse<PaymentExportRow>({
    filename: `${store.slug}-payments.csv`,
    rows,
    columns: [
      { header: "section", value: (row) => row.section },
      { header: "metric", value: (row) => row.metric },
      { header: "label", value: (row) => row.label },
      { header: "value", value: (row) => row.value },
      { header: "count", value: (row) => row.count },
      { header: "status", value: (row) => row.status },
      { header: "detail", value: (row) => row.detail },
      { header: "date", value: (row) => row.date },
      { header: "href", value: (row) => row.href },
    ],
  });
}
