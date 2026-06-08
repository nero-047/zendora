import { requireAppUser } from "@/features/auth/app-user";
import { csvResponse } from "@/features/commerce/csv-export";
import { getStoreWorkspace } from "@/features/commerce/data";
import {
  getReturnRequestQueue,
  returnRequestReasonLabels,
  returnRequestStatusLabels,
} from "@/features/commerce/returns";
import type { ReturnRequestStatus } from "@/features/commerce/types";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

type ExportRouteContext = {
  params: Promise<{ storeId: string }>;
};

type ReturnSlaRow = {
  requestId: string;
  orderId: string;
  customerName: string;
  customerEmail: string;
  status: string;
  reason: string;
  slaStatus: string;
  priority: string;
  requestedAgeDays: number;
  refundableValue: string;
  requestedAt: string;
  updatedAt: string;
  resolvedAt?: string;
  recommendedAction: string;
  detail: string;
  href: string;
};

const returnSlaReviewDays = 2;
const returnSlaResolutionDays = 5;

function formatDate(value: string | undefined) {
  return value ? new Date(value).toISOString() : "";
}

function getReturnSlaStatus(status: ReturnRequestStatus, requestedAgeDays: number) {
  if (status === "requested") {
    return requestedAgeDays > returnSlaReviewDays
      ? "Review overdue"
      : "Review due";
  }

  if (status === "approved") {
    return requestedAgeDays > returnSlaResolutionDays
      ? "Resolution overdue"
      : "Awaiting resolution";
  }

  if (status === "resolved") {
    return "Resolved";
  }

  return "Rejected";
}

function getReturnPriority(status: ReturnRequestStatus, requestedAgeDays: number) {
  if (
    (status === "requested" && requestedAgeDays > returnSlaReviewDays) ||
    (status === "approved" && requestedAgeDays > returnSlaResolutionDays)
  ) {
    return "critical";
  }

  if (status === "requested" || status === "approved") {
    return "high";
  }

  return "closed";
}

function getReturnAction(status: ReturnRequestStatus, requestedAgeDays: number) {
  if (status === "requested") {
    return requestedAgeDays > returnSlaReviewDays
      ? "Review the customer request immediately and approve or reject it."
      : "Review the customer request before the SLA window closes.";
  }

  if (status === "approved") {
    return requestedAgeDays > returnSlaResolutionDays
      ? "Resolve the approved return and issue the eligible refund."
      : "Track the returned item and prepare refund resolution.";
  }

  if (status === "resolved") {
    return "No action needed; return is resolved.";
  }

  return "No action needed unless the customer reopens support.";
}

export async function GET(_request: Request, context: ExportRouteContext) {
  const { storeId } = await context.params;
  const user = await requireAppUser();
  const workspace = await getStoreWorkspace(user.id, storeId);

  if (!workspace) {
    return new Response("Store not found.", { status: 404 });
  }

  const { store } = workspace;
  const queue = getReturnRequestQueue(workspace.orders, {
    includeClosed: true,
    storeId: store.id,
  });
  const rows: ReturnSlaRow[] = queue.map((item) => ({
    requestId: item.request.id,
    orderId: item.order.id,
    customerName: item.order.customerName,
    customerEmail: item.order.customerEmail,
    status: returnRequestStatusLabels[item.request.status],
    reason: returnRequestReasonLabels[item.request.reason],
    slaStatus: getReturnSlaStatus(
      item.request.status,
      item.requestedAgeDays,
    ),
    priority: getReturnPriority(item.request.status, item.requestedAgeDays),
    requestedAgeDays: item.requestedAgeDays,
    refundableValue: formatCurrency(
      item.order.refundableCents,
      item.order.currency,
    ),
    requestedAt: formatDate(item.request.requestedAt),
    updatedAt: formatDate(item.request.updatedAt),
    resolvedAt: formatDate(item.request.resolvedAt),
    recommendedAction: getReturnAction(
      item.request.status,
      item.requestedAgeDays,
    ),
    detail: [
      item.detail,
      item.request.note,
      item.request.merchantNote,
      item.order.customerEmail,
    ]
      .filter(Boolean)
      .join(" / "),
    href: item.href,
  }));

  return csvResponse<ReturnSlaRow>({
    filename: `${store.slug}-return-sla.csv`,
    rows,
    columns: [
      { header: "request_id", value: (row) => row.requestId },
      { header: "order_id", value: (row) => row.orderId },
      { header: "customer_name", value: (row) => row.customerName },
      { header: "customer_email", value: (row) => row.customerEmail },
      { header: "status", value: (row) => row.status },
      { header: "reason", value: (row) => row.reason },
      { header: "sla_status", value: (row) => row.slaStatus },
      { header: "priority", value: (row) => row.priority },
      {
        header: "requested_age_days",
        value: (row) => row.requestedAgeDays,
      },
      { header: "refundable_value", value: (row) => row.refundableValue },
      { header: "requested_at", value: (row) => row.requestedAt },
      { header: "updated_at", value: (row) => row.updatedAt },
      { header: "resolved_at", value: (row) => row.resolvedAt },
      {
        header: "recommended_action",
        value: (row) => row.recommendedAction,
      },
      { header: "detail", value: (row) => row.detail },
      { header: "href", value: (row) => row.href },
    ],
  });
}
