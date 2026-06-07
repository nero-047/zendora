import { requireAppUser } from "@/features/auth/app-user";
import {
  customerSegmentLabels,
  filterCustomers,
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

function readParam(searchParams: URLSearchParams, key: string) {
  return searchParams.get(key) || undefined;
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
  });

  return csvResponse<CustomerSummary>({
    filename: `${workspace.store.slug}-customers.csv`,
    rows,
    columns: [
      { header: "email", value: (customer) => customer.email },
      { header: "name", value: (customer) => customer.name },
      { header: "phone", value: (customer) => customer.phone },
      { header: "tags", value: (customer) => customer.tags.join(", ") },
      {
        header: "accepts_marketing",
        value: (customer) => customer.acceptsMarketing,
      },
      { header: "tax_exempt", value: (customer) => customer.taxExempt },
      {
        header: "segment",
        value: (customer) =>
          customerSegmentLabels[getCustomerSegmentation(customer).primarySegment],
      },
      { header: "orders", value: (customer) => customer.orderCount },
      {
        header: "paid_orders",
        value: (customer) => customer.paidOrderCount,
      },
      {
        header: "total_spent",
        value: (customer) =>
          formatCurrency(customer.totalSpentCents, customer.currency),
      },
      {
        header: "average_order_value",
        value: (customer) =>
          formatCurrency(
            getCustomerSegmentation(customer).averageOrderValueCents,
            customer.currency,
          ),
      },
      {
        header: "refund_rate",
        value: (customer) => getCustomerSegmentation(customer).refundRate,
      },
      {
        header: "last_order_at",
        value: (customer) =>
          customer.lastOrderAt
            ? new Date(customer.lastOrderAt).toISOString()
            : undefined,
      },
      {
        header: "last_order_status",
        value: (customer) => customer.lastOrderStatus,
      },
      {
        header: "shipping_city",
        value: (customer) => customer.latestShippingAddress?.city,
      },
      {
        header: "shipping_country",
        value: (customer) => customer.latestShippingAddress?.country,
      },
    ],
  });
}
