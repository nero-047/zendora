import { requireAppUser } from "@/features/auth/app-user";
import { csvResponse } from "@/features/commerce/csv-export";
import { getStoreWorkspace } from "@/features/commerce/data";
import { orderStatusLabels, paymentStatusLabels } from "@/features/commerce/order-status";
import {
  getReturnRequestQueue,
  getReturnRequestQueueStats,
  returnRequestReasonLabels,
  returnRequestStatusLabels,
} from "@/features/commerce/returns";
import type { RefundReason } from "@/features/commerce/types";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

type ExportRouteContext = {
  params: Promise<{ storeId: string }>;
};

type ReturnsExportRow = {
  section: string;
  metric: string;
  label: string;
  value: string | number;
  status?: string;
  detail?: string;
  href?: string;
};

const refundReasonLabels: Record<RefundReason, string> = {
  customer_request: "Customer request",
  damaged: "Damaged item",
  fraud: "Fraud",
  other: "Other",
};

function formatDate(value: string | undefined) {
  return value ? new Date(value).toISOString() : "";
}

export async function GET(_request: Request, context: ExportRouteContext) {
  const { storeId } = await context.params;
  const user = await requireAppUser();
  const workspace = await getStoreWorkspace(user.id, storeId);

  if (!workspace) {
    return new Response("Store not found.", { status: 404 });
  }

  const { store } = workspace;
  const activeQueue = getReturnRequestQueue(workspace.orders, {
    storeId: store.id,
  });
  const fullQueue = getReturnRequestQueue(workspace.orders, {
    includeClosed: true,
    storeId: store.id,
  });
  const returnStats = getReturnRequestQueueStats(activeQueue);
  const refunds = workspace.orders
    .flatMap((order) => order.refunds.map((refund) => ({ order, refund })))
    .sort(
      (a, b) =>
        new Date(b.refund.createdAt).getTime() -
        new Date(a.refund.createdAt).getTime(),
    );
  const rows: ReturnsExportRow[] = [
    {
      section: "summary",
      metric: "return_requests",
      label: "Return requests",
      value: fullQueue.length,
      detail: `${returnStats.needsReview} need review / ${returnStats.awaitingResolution} awaiting resolution`,
    },
    {
      section: "summary",
      metric: "refunds",
      label: "Refunds",
      value: formatCurrency(
        refunds.reduce((sum, item) => sum + item.refund.amountCents, 0),
        store.currency,
      ),
      detail: `${refunds.length} refunds recorded`,
    },
    {
      section: "summary",
      metric: "payment_refunds",
      label: "Payment refunds",
      value: formatCurrency(
        refunds.reduce((sum, item) => sum + item.refund.paymentCents, 0),
        store.currency,
      ),
    },
    {
      section: "summary",
      metric: "gift_card_refunds",
      label: "Gift card refunds",
      value: formatCurrency(
        refunds.reduce((sum, item) => sum + item.refund.giftCardCents, 0),
        store.currency,
      ),
    },
    ...fullQueue.map((item) => ({
      section: "return_request",
      metric: item.request.id,
      label: returnRequestReasonLabels[item.request.reason],
      value: formatCurrency(item.order.refundableCents, item.order.currency),
      status: returnRequestStatusLabels[item.request.status],
      detail: [
        item.label,
        item.order.customerEmail,
        `${item.requestedAgeDays} days old`,
        item.request.note,
        item.request.merchantNote,
        formatDate(item.request.requestedAt),
        formatDate(item.request.resolvedAt),
      ]
        .filter(Boolean)
        .join(" / "),
      href: item.href,
    })),
    ...refunds.map(({ order, refund }) => ({
      section: "refund",
      metric: refund.id,
      label: refundReasonLabels[refund.reason],
      value: formatCurrency(refund.amountCents, order.currency),
      status: refund.restockedInventory ? "Inventory restocked" : "No restock",
      detail: [
        order.customerEmail,
        orderStatusLabels[order.status],
        paymentStatusLabels[order.paymentStatus],
        `payment ${formatCurrency(refund.paymentCents, order.currency)}`,
        `gift card ${formatCurrency(refund.giftCardCents, order.currency)}`,
        refund.note,
        formatDate(refund.createdAt),
      ]
        .filter(Boolean)
        .join(" / "),
      href: `/dashboard/stores/${store.id}/orders/${order.id}`,
    })),
  ];

  return csvResponse<ReturnsExportRow>({
    filename: `${store.slug}-returns-refunds.csv`,
    rows,
    columns: [
      { header: "section", value: (row) => row.section },
      { header: "metric", value: (row) => row.metric },
      { header: "label", value: (row) => row.label },
      { header: "value", value: (row) => row.value },
      { header: "status", value: (row) => row.status },
      { header: "detail", value: (row) => row.detail },
      { header: "href", value: (row) => row.href },
    ],
  });
}
