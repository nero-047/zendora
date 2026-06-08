import { requireAppUser } from "@/features/auth/app-user";
import { csvResponse } from "@/features/commerce/csv-export";
import { getStoreWorkspace } from "@/features/commerce/data";
import {
  orderStatusLabels,
  paymentMethodLabels,
  paymentStatusLabels,
} from "@/features/commerce/order-status";
import {
  paymentTransactionStatusLabels,
  paymentTransactionTypeLabels,
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

type PayoutExportRow = {
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

type PayoutTransactionRow = {
  order: Order;
  transaction: OrderPaymentTransaction;
};

type PayoutBatch = {
  id: string;
  provider: string;
  currency: string;
  processedDate: string;
  transactions: PayoutTransactionRow[];
  grossCents: number;
  refundCents: number;
  feeCents: number;
  netCents: number;
};

function formatDate(value: string | undefined) {
  return value ? new Date(value).toISOString() : "";
}

function getTransactionDate(transaction: OrderPaymentTransaction) {
  return transaction.processedAt || transaction.createdAt;
}

function getProcessedDateKey(transaction: OrderPaymentTransaction) {
  return getTransactionDate(transaction).slice(0, 10);
}

function getEstimatedFeeCents(transaction: OrderPaymentTransaction) {
  if (transaction.status !== "succeeded" || transaction.type !== "capture") {
    return 0;
  }

  const methodFee: Record<PaymentMethod, number> = {
    bank_transfer: Math.min(500, Math.round(transaction.amountCents * 0.008)),
    card: Math.round(transaction.amountCents * 0.029) + 30,
    cash_on_delivery: 0,
    manual_invoice: 0,
    other: Math.round(transaction.amountCents * 0.02),
  };

  return Math.max(0, methodFee[transaction.paymentMethod]);
}

function getPayoutImpactCents(transaction: OrderPaymentTransaction) {
  if (transaction.status !== "succeeded") {
    return 0;
  }

  if (transaction.type === "capture") {
    return transaction.amountCents - getEstimatedFeeCents(transaction);
  }

  if (transaction.type === "refund") {
    return -transaction.amountCents;
  }

  return 0;
}

function buildPayoutBatches(rows: PayoutTransactionRow[]) {
  const batches = new Map<string, PayoutBatch>();

  for (const row of rows) {
    const { transaction } = row;

    if (
      transaction.status !== "succeeded" ||
      (transaction.type !== "capture" && transaction.type !== "refund")
    ) {
      continue;
    }

    const processedDate = getProcessedDateKey(transaction);
    const id = `${processedDate}:${transaction.paymentProvider}`;
    const current = batches.get(id) || {
      id,
      provider: transaction.paymentProvider,
      currency: transaction.currency,
      processedDate,
      transactions: [],
      grossCents: 0,
      refundCents: 0,
      feeCents: 0,
      netCents: 0,
    };

    current.transactions.push(row);

    if (transaction.type === "capture") {
      current.grossCents += transaction.amountCents;
      current.feeCents += getEstimatedFeeCents(transaction);
    }

    if (transaction.type === "refund") {
      current.refundCents += transaction.amountCents;
    }

    current.netCents += getPayoutImpactCents(transaction);
    batches.set(id, current);
  }

  return [...batches.values()].sort(
    (a, b) =>
      new Date(b.processedDate).getTime() - new Date(a.processedDate).getTime() ||
      a.provider.localeCompare(b.provider),
  );
}

function getBatchStatus(batch: PayoutBatch) {
  if (batch.netCents < 0) {
    return "Negative payout";
  }

  if (batch.refundCents > 0) {
    return "Refund adjusted";
  }

  return "Ready";
}

function getBatchDetail(batch: PayoutBatch, currency: string) {
  return [
    `${formatCurrency(batch.grossCents, currency)} gross captures`,
    `${formatCurrency(batch.refundCents, currency)} refunds`,
    `${formatCurrency(batch.feeCents, currency)} estimated fees`,
    "Ready for finance review.",
  ].join(" / ");
}

export async function GET(_request: Request, context: ExportRouteContext) {
  const { storeId } = await context.params;
  const user = await requireAppUser();
  const workspace = await getStoreWorkspace(user.id, storeId);

  if (!workspace) {
    return new Response("Store not found.", { status: 404 });
  }

  const { store } = workspace;
  const transactionRows: PayoutTransactionRow[] = workspace.orders
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
  const batches = buildPayoutBatches(transactionRows);
  const succeededTransactions = transactionRows.filter(
    ({ transaction }) => transaction.status === "succeeded",
  );
  const grossCaptureCents = batches.reduce(
    (sum, batch) => sum + batch.grossCents,
    0,
  );
  const refundCents = batches.reduce((sum, batch) => sum + batch.refundCents, 0);
  const estimatedFeeCents = batches.reduce(
    (sum, batch) => sum + batch.feeCents,
    0,
  );
  const netPayoutCents = batches.reduce((sum, batch) => sum + batch.netCents, 0);
  const rows: PayoutExportRow[] = [
    {
      section: "payout_summary",
      metric: "gross_captures",
      label: "Gross captures",
      value: formatCurrency(grossCaptureCents, store.currency),
      count: succeededTransactions.length,
      detail: `${batches.length} settlement batches from successful captures and refunds`,
    },
    {
      section: "payout_summary",
      metric: "refunds",
      label: "Refunds",
      value: formatCurrency(refundCents, store.currency),
    },
    {
      section: "payout_summary",
      metric: "estimated_fees",
      label: "Estimated fees",
      value: formatCurrency(estimatedFeeCents, store.currency),
    },
    {
      section: "payout_summary",
      metric: "net_payout",
      label: "Net payout",
      value: formatCurrency(netPayoutCents, store.currency),
      status: netPayoutCents >= 0 ? "Ready" : "Review",
      detail: "Estimated payout after refunds and processing fees.",
    },
    ...batches.map((batch) => ({
      section: "payout_batch",
      metric: batch.id,
      label: batch.provider,
      value: formatCurrency(batch.netCents, batch.currency),
      count: batch.transactions.length,
      status: getBatchStatus(batch),
      detail: getBatchDetail(batch, batch.currency),
      date: formatDate(`${batch.processedDate}T00:00:00.000Z`),
    })),
    ...transactionRows.map(({ order, transaction }) => ({
      section: "payout_transaction",
      metric: transaction.id,
      label: paymentTransactionTypeLabels[transaction.type],
      value: formatCurrency(
        getPayoutImpactCents(transaction),
        transaction.currency,
      ),
      status: paymentTransactionStatusLabels[transaction.status],
      detail: [
        `${formatCurrency(transaction.amountCents, transaction.currency)} ${paymentTransactionTypeLabels[
          transaction.type
        ].toLowerCase()}`,
        `${formatCurrency(
          getEstimatedFeeCents(transaction),
          transaction.currency,
        )} estimated fee`,
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
  ];

  return csvResponse<PayoutExportRow>({
    filename: `${store.slug}-payouts.csv`,
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
