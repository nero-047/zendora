import { requireAppUser } from "@/features/auth/app-user";
import {
  customerSegmentLabels,
  filterCustomers,
  getCustomerHref,
  getCustomerSegmentation,
  getCustomerSummaries,
  parseCustomerMarketingFilter,
  parseCustomerOrderActivityFilter,
  parseCustomerSegmentFilter,
  parseCustomerSortOption,
  readCustomerSearchParam,
} from "@/features/commerce/customers";
import { csvResponse } from "@/features/commerce/csv-export";
import { getStoreWorkspace } from "@/features/commerce/data";
import type { CustomerSummary } from "@/features/commerce/types";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

type ExportRouteContext = {
  params: Promise<{ storeId: string }>;
};

type PrivacyExportRow = {
  customer: CustomerSummary;
  storeId: string;
};

function readParam(searchParams: URLSearchParams, key: string) {
  return searchParams.get(key) || undefined;
}

function formatDate(value: string | undefined) {
  return value ? new Date(value).toISOString() : "";
}

function getRefundedCents(customer: CustomerSummary) {
  return customer.orders.reduce(
    (sum, order) => sum + Math.max(0, order.refundedCents),
    0,
  );
}

function hasOpenReturn(customer: CustomerSummary) {
  return customer.orders.some((order) =>
    order.returnRequests.some(
      (request) =>
        request.status === "requested" || request.status === "approved",
    ),
  );
}

function getConsentStatus(customer: CustomerSummary) {
  return customer.acceptsMarketing
    ? "Marketing consent recorded"
    : "No marketing consent";
}

function getDataScope(customer: CustomerSummary) {
  return [
    customer.profileId ? "profile" : "",
    customer.orderCount > 0 ? "orders" : "",
    customer.latestShippingAddress ? "shipping_address" : "",
    customer.note ? "merchant_note" : "",
    customer.orders.some((order) => order.customerNote) ? "customer_notes" : "",
    getRefundedCents(customer) > 0 ? "refunds" : "",
    hasOpenReturn(customer) ? "open_returns" : "",
    customer.taxExempt ? "tax_exemption" : "",
  ]
    .filter(Boolean)
    .join(" | ");
}

function getRetentionStatus(customer: CustomerSummary) {
  if (hasOpenReturn(customer)) {
    return "retain_until_return_resolved";
  }

  if (customer.taxExempt) {
    return "retain_tax_records";
  }

  if (customer.orderCount > 0) {
    return "retain_order_records";
  }

  return "profile_only_review";
}

function getPrivacyAction(customer: CustomerSummary) {
  if (!customer.acceptsMarketing) {
    return "Suppress promotional campaigns until consent is collected.";
  }

  if (hasOpenReturn(customer)) {
    return "Resolve open returns before processing deletion requests.";
  }

  if (customer.taxExempt) {
    return "Preserve tax-exemption records for finance review.";
  }

  if (customer.orderCount > 0) {
    return "Use the customer detail export before any privacy request workflow.";
  }

  return "Review profile-only lead for consent refresh or deletion.";
}

export async function GET(request: Request, context: ExportRouteContext) {
  const { storeId } = await context.params;
  const user = await requireAppUser();
  const workspace = await getStoreWorkspace(user.id, storeId);

  if (!workspace) {
    return new Response("Store not found.", { status: 404 });
  }

  const searchParams = new URL(request.url).searchParams;
  const customers = getCustomerSummaries(
    workspace.orders,
    workspace.store.currency,
    workspace.customerProfiles,
  );
  const rows = filterCustomers({
    customers,
    query: readCustomerSearchParam(readParam(searchParams, "q")),
    segment: parseCustomerSegmentFilter(readParam(searchParams, "segment")),
    marketing: parseCustomerMarketingFilter(readParam(searchParams, "marketing")),
    activity: parseCustomerOrderActivityFilter(readParam(searchParams, "activity")),
    sort: parseCustomerSortOption(readParam(searchParams, "sort")),
  }).map((customer) => ({ customer, storeId: workspace.store.id }));

  return csvResponse<PrivacyExportRow>({
    filename: `${workspace.store.slug}-customer-privacy.csv`,
    rows,
    columns: [
      { header: "email", value: (row) => row.customer.email },
      { header: "name", value: (row) => row.customer.name },
      { header: "profile_id", value: (row) => row.customer.profileId },
      {
        header: "consent_status",
        value: (row) => getConsentStatus(row.customer),
      },
      {
        header: "accepts_marketing",
        value: (row) => row.customer.acceptsMarketing,
      },
      {
        header: "tax_exempt",
        value: (row) => row.customer.taxExempt,
      },
      {
        header: "segment",
        value: (row) =>
          customerSegmentLabels[
            getCustomerSegmentation(row.customer).primarySegment
          ],
      },
      { header: "data_scope", value: (row) => getDataScope(row.customer) },
      {
        header: "retention_status",
        value: (row) => getRetentionStatus(row.customer),
      },
      {
        header: "recommended_action",
        value: (row) => getPrivacyAction(row.customer),
      },
      { header: "orders", value: (row) => row.customer.orderCount },
      {
        header: "paid_orders",
        value: (row) => row.customer.paidOrderCount,
      },
      {
        header: "total_spent",
        value: (row) =>
          formatCurrency(row.customer.totalSpentCents, row.customer.currency),
      },
      {
        header: "refunded",
        value: (row) =>
          formatCurrency(getRefundedCents(row.customer), row.customer.currency),
      },
      {
        header: "open_return",
        value: (row) => hasOpenReturn(row.customer),
      },
      {
        header: "latest_shipping_country",
        value: (row) => row.customer.latestShippingAddress?.country,
      },
      {
        header: "profile_created_at",
        value: (row) => formatDate(row.customer.profileCreatedAt),
      },
      {
        header: "profile_updated_at",
        value: (row) => formatDate(row.customer.profileUpdatedAt),
      },
      {
        header: "first_order_at",
        value: (row) => formatDate(row.customer.firstOrderAt),
      },
      {
        header: "last_order_at",
        value: (row) => formatDate(row.customer.lastOrderAt),
      },
      {
        header: "customer_export_href",
        value: (row) =>
          `${getCustomerHref(row.storeId, row.customer.email)}/export`,
      },
      {
        header: "customer_href",
        value: (row) => getCustomerHref(row.storeId, row.customer.email),
      },
    ],
  });
}
