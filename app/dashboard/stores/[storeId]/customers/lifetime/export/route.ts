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
import type { CustomerSummary, OrderItem } from "@/features/commerce/types";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

type ExportRouteContext = {
  params: Promise<{ storeId: string }>;
};

type LifetimeValueRow = {
  customer: CustomerSummary;
  storeId: string;
};

type ProductSpend = {
  name: string;
  quantity: number;
  valueCents: number;
};

function readParam(searchParams: URLSearchParams, key: string) {
  return searchParams.get(key) || undefined;
}

function formatDate(value: string | undefined) {
  return value ? new Date(value).toISOString() : "";
}

function getRetentionStatus(customer: CustomerSummary) {
  const segmentation = getCustomerSegmentation(customer);

  if (segmentation.primarySegment === "lead") {
    return "Lead";
  }

  if (segmentation.segments.includes("refund_watch")) {
    return "Support review";
  }

  if (segmentation.segments.includes("at_risk")) {
    return "Win-back";
  }

  if (segmentation.segments.includes("vip")) {
    return "Retain VIP";
  }

  if (segmentation.segments.includes("repeat")) {
    return "Grow repeat";
  }

  return "Nurture";
}

function summarizeProductSpend(customer: CustomerSummary) {
  const products = new Map<string, ProductSpend>();

  for (const order of customer.orders) {
    const orderNetRatio =
      order.totalCents > 0
        ? Math.max(0, order.totalCents - order.refundedCents) / order.totalCents
        : 0;

    for (const item of order.items || []) {
      const key = item.productId || item.productName.toLowerCase();
      const current = products.get(key) || {
        name: getItemLabel(item),
        quantity: 0,
        valueCents: 0,
      };

      current.quantity += item.quantity;
      current.valueCents += Math.round(
        item.unitPriceCents * item.quantity * orderNetRatio,
      );
      products.set(key, current);
    }
  }

  return [...products.values()]
    .sort(
      (a, b) =>
        b.valueCents - a.valueCents ||
        b.quantity - a.quantity ||
        a.name.localeCompare(b.name),
    )
    .slice(0, 4)
    .map((product) => `${product.name} x${product.quantity}`)
    .join(" / ");
}

function getItemLabel(item: OrderItem) {
  return item.variantName
    ? `${item.productName} (${item.variantName})`
    : item.productName;
}

function getGrossSpentCents(customer: CustomerSummary) {
  return customer.orders.reduce(
    (sum, order) => sum + Math.max(0, order.totalCents),
    0,
  );
}

function getRefundedCents(customer: CustomerSummary) {
  return customer.orders.reduce(
    (sum, order) => sum + Math.max(0, order.refundedCents),
    0,
  );
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
  }).map((customer) => ({
    customer,
    storeId: workspace.store.id,
  }));

  return csvResponse<LifetimeValueRow>({
    filename: `${workspace.store.slug}-customer-lifetime-value.csv`,
    rows,
    columns: [
      { header: "email", value: (row) => row.customer.email },
      { header: "name", value: (row) => row.customer.name },
      {
        header: "primary_segment",
        value: (row) =>
          customerSegmentLabels[
            getCustomerSegmentation(row.customer).primarySegment
          ],
      },
      {
        header: "lifetime_value",
        value: (row) =>
          formatCurrency(row.customer.totalSpentCents, row.customer.currency),
      },
      {
        header: "gross_spent",
        value: (row) =>
          formatCurrency(getGrossSpentCents(row.customer), row.customer.currency),
      },
      {
        header: "refunded",
        value: (row) =>
          formatCurrency(getRefundedCents(row.customer), row.customer.currency),
      },
      { header: "paid_orders", value: (row) => row.customer.paidOrderCount },
      { header: "orders", value: (row) => row.customer.orderCount },
      {
        header: "average_order_value",
        value: (row) =>
          formatCurrency(
            getCustomerSegmentation(row.customer).averageOrderValueCents,
            row.customer.currency,
          ),
      },
      {
        header: "refund_rate",
        value: (row) => `${getCustomerSegmentation(row.customer).refundRate}%`,
      },
      {
        header: "days_since_last_order",
        value: (row) => getCustomerSegmentation(row.customer).daysSinceLastOrder,
      },
      {
        header: "retention_status",
        value: (row) => getRetentionStatus(row.customer),
      },
      {
        header: "marketing_opt_in",
        value: (row) => row.customer.acceptsMarketing,
      },
      {
        header: "tax_exempt",
        value: (row) => row.customer.taxExempt,
      },
      {
        header: "top_products",
        value: (row) => summarizeProductSpend(row.customer),
      },
      {
        header: "next_action",
        value: (row) => getCustomerSegmentation(row.customer).nextAction,
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
        header: "customer_href",
        value: (row) => getCustomerHref(row.storeId, row.customer.email),
      },
    ],
  });
}
