import { requireAppUser } from "@/features/auth/app-user";
import {
  customerSegmentFilters,
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
  type CustomerSegment,
} from "@/features/commerce/customers";
import { csvResponse } from "@/features/commerce/csv-export";
import { getStoreWorkspace } from "@/features/commerce/data";
import type { CustomerSummary } from "@/features/commerce/types";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

type ExportRouteContext = {
  params: Promise<{ storeId: string }>;
};

type CustomerSegmentExportRow = {
  segment: CustomerSegment;
  customers: CustomerSummary[];
};

const customerSegmentCriteria: Record<CustomerSegment, string> = {
  lead: "Profile exists without linked orders",
  new: "Recent first paid order",
  repeat: "Two or more paid orders",
  vip: "VIP tag or high lifetime spend",
  at_risk: "Paid buyer without recent order activity",
  refund_watch: "High refunded share of paid order value",
};

const customerSegmentRecommendedActions: Record<CustomerSegment, string> = {
  lead: "Send a welcome or first-purchase offer when marketing consent exists.",
  new: "Follow up after the first purchase and recommend complementary products.",
  repeat: "Build replenishment, bundle, or loyalty campaigns for these buyers.",
  vip: "Prioritize early access, support, and high-touch retention campaigns.",
  at_risk: "Send a win-back offer before the customer fully churns.",
  refund_watch: "Review support history before sending proactive offers.",
};

function readParam(searchParams: URLSearchParams, key: string) {
  return searchParams.get(key) || undefined;
}

function getPrimaryCustomerCount(row: CustomerSegmentExportRow) {
  return row.customers.filter(
    (customer) => getCustomerSegmentation(customer).primarySegment === row.segment,
  ).length;
}

function getMarketingOptInCount(customers: CustomerSummary[]) {
  return customers.filter((customer) => customer.acceptsMarketing).length;
}

function getPaidOrderCount(customers: CustomerSummary[]) {
  return customers.reduce((sum, customer) => sum + customer.paidOrderCount, 0);
}

function getTotalSpentCents(customers: CustomerSummary[]) {
  return customers.reduce((sum, customer) => sum + customer.totalSpentCents, 0);
}

function getAverageOrderValueCents(customers: CustomerSummary[]) {
  const paidOrders = getPaidOrderCount(customers);

  if (paidOrders === 0) {
    return 0;
  }

  return Math.round(getTotalSpentCents(customers) / paidOrders);
}

function getAverageRefundRate(customers: CustomerSummary[]) {
  const activeCustomers = customers.filter((customer) => customer.paidOrderCount > 0);

  if (activeCustomers.length === 0) {
    return 0;
  }

  return Math.round(
    activeCustomers.reduce(
      (sum, customer) => sum + getCustomerSegmentation(customer).refundRate,
      0,
    ) / activeCustomers.length,
  );
}

function getAverageDaysSinceLastOrder(customers: CustomerSummary[]) {
  const dayValues = customers
    .map((customer) => getCustomerSegmentation(customer).daysSinceLastOrder)
    .filter((value): value is number => typeof value === "number");

  if (dayValues.length === 0) {
    return "";
  }

  return Math.round(
    dayValues.reduce((sum, value) => sum + value, 0) / dayValues.length,
  );
}

function getTopCustomer(customers: CustomerSummary[]) {
  return customers
    .slice()
    .sort(
      (first, second) =>
        second.totalSpentCents - first.totalSpentCents ||
        second.paidOrderCount - first.paidOrderCount ||
        first.name.localeCompare(second.name),
    )[0];
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
  const filteredCustomers = filterCustomers({
    customers,
    query: readCustomerSearchParam(readParam(searchParams, "q")),
    segment: parseCustomerSegmentFilter(readParam(searchParams, "segment")),
    marketing: parseCustomerMarketingFilter(readParam(searchParams, "marketing")),
    activity: parseCustomerOrderActivityFilter(readParam(searchParams, "activity")),
    sort: parseCustomerSortOption(readParam(searchParams, "sort")),
  });
  const rows = customerSegmentFilters
    .filter((segment): segment is CustomerSegment => segment !== "all")
    .map((segment) => ({
      segment,
      customers: filteredCustomers.filter((customer) =>
        getCustomerSegmentation(customer).segments.includes(segment),
      ),
    }));

  return csvResponse<CustomerSegmentExportRow>({
    filename: `${workspace.store.slug}-customer-segments.csv`,
    rows,
    columns: [
      { header: "segment", value: (row) => row.segment },
      { header: "label", value: (row) => customerSegmentLabels[row.segment] },
      {
        header: "criteria",
        value: (row) => customerSegmentCriteria[row.segment],
      },
      { header: "customers", value: (row) => row.customers.length },
      { header: "primary_customers", value: getPrimaryCustomerCount },
      {
        header: "marketing_opt_ins",
        value: (row) => getMarketingOptInCount(row.customers),
      },
      {
        header: "campaign_eligible",
        value: (row) =>
          row.segment === "refund_watch"
            ? 0
            : getMarketingOptInCount(row.customers),
      },
      { header: "paid_orders", value: (row) => getPaidOrderCount(row.customers) },
      {
        header: "total_spent",
        value: (row) =>
          formatCurrency(getTotalSpentCents(row.customers), workspace.store.currency),
      },
      {
        header: "average_order_value",
        value: (row) =>
          formatCurrency(
            getAverageOrderValueCents(row.customers),
            workspace.store.currency,
          ),
      },
      { header: "average_refund_rate", value: (row) => getAverageRefundRate(row.customers) },
      {
        header: "average_days_since_last_order",
        value: (row) => getAverageDaysSinceLastOrder(row.customers),
      },
      {
        header: "top_customer",
        value: (row) => getTopCustomer(row.customers)?.name || "",
      },
      {
        header: "top_customer_email",
        value: (row) => getTopCustomer(row.customers)?.email || "",
      },
      {
        header: "top_customer_spend",
        value: (row) => {
          const topCustomer = getTopCustomer(row.customers);

          return topCustomer
            ? formatCurrency(topCustomer.totalSpentCents, topCustomer.currency)
            : "";
        },
      },
      {
        header: "recommended_action",
        value: (row) => customerSegmentRecommendedActions[row.segment],
      },
      {
        header: "audience_href",
        value: (row) =>
          `/dashboard/stores/${workspace.store.id}/customers?segment=${row.segment}`,
      },
      {
        header: "top_customer_href",
        value: (row) => {
          const topCustomer = getTopCustomer(row.customers);

          return topCustomer
            ? getCustomerHref(workspace.store.id, topCustomer.email)
            : "";
        },
      },
    ],
  });
}
