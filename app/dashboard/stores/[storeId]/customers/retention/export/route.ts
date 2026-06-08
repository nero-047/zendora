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

type RetentionPriority = "critical" | "high" | "medium" | "low" | "blocked";

type RetentionRow = {
  campaignType: string;
  customer: CustomerSummary;
  marketingEligible: boolean;
  priority: RetentionPriority;
  recommendedAction: string;
  storeId: string;
};

const retentionPriorityRank: Record<RetentionPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  blocked: 4,
};

function readParam(searchParams: URLSearchParams, key: string) {
  return searchParams.get(key) || undefined;
}

function formatDate(value?: string) {
  return value ? new Date(value).toISOString() : "";
}

function getRetentionPriority(customer: CustomerSummary): RetentionPriority {
  const segmentation = getCustomerSegmentation(customer);

  if (segmentation.primarySegment === "refund_watch") {
    return "critical";
  }

  if (segmentation.primarySegment === "at_risk") {
    return customer.acceptsMarketing ? "critical" : "blocked";
  }

  if (segmentation.primarySegment === "vip") {
    return "high";
  }

  if (segmentation.primarySegment === "lead") {
    return customer.acceptsMarketing ? "high" : "blocked";
  }

  if (segmentation.primarySegment === "repeat") {
    return "medium";
  }

  return "low";
}

function getCampaignType(customer: CustomerSummary) {
  const segmentation = getCustomerSegmentation(customer);

  if (
    !customer.acceptsMarketing &&
    (segmentation.primarySegment === "lead" ||
      segmentation.primarySegment === "at_risk")
  ) {
    return "consent_capture";
  }

  if (segmentation.primarySegment === "refund_watch") {
    return "support_review";
  }

  if (segmentation.primarySegment === "at_risk") {
    return "win_back";
  }

  if (segmentation.primarySegment === "vip") {
    return "loyalty";
  }

  if (segmentation.primarySegment === "repeat") {
    return "cross_sell";
  }

  if (segmentation.primarySegment === "new") {
    return "post_purchase";
  }

  return "first_purchase";
}

function isMarketingEligible(customer: CustomerSummary) {
  return (
    customer.acceptsMarketing &&
    getCustomerSegmentation(customer).primarySegment !== "refund_watch"
  );
}

function getRecommendedAction(customer: CustomerSummary) {
  const segmentation = getCustomerSegmentation(customer);

  if (segmentation.primarySegment === "refund_watch") {
    return "Route to support before sending retention offers.";
  }

  if (
    !customer.acceptsMarketing &&
    (segmentation.primarySegment === "lead" ||
      segmentation.primarySegment === "at_risk")
  ) {
    return "Collect marketing consent or use service-only outreach before campaigns.";
  }

  return segmentation.nextAction;
}

function getSignalLabels(customer: CustomerSummary) {
  return getCustomerSegmentation(customer)
    .signals.map((signal) => signal.label)
    .join(" | ");
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
  })
    .map((customer) => ({
      campaignType: getCampaignType(customer),
      customer,
      marketingEligible: isMarketingEligible(customer),
      priority: getRetentionPriority(customer),
      recommendedAction: getRecommendedAction(customer),
      storeId: workspace.store.id,
    }))
    .sort((first, second) => {
      const firstSegmentation = getCustomerSegmentation(first.customer);
      const secondSegmentation = getCustomerSegmentation(second.customer);

      return (
        retentionPriorityRank[first.priority] -
          retentionPriorityRank[second.priority] ||
        Number(second.marketingEligible) - Number(first.marketingEligible) ||
        (secondSegmentation.daysSinceLastOrder || 0) -
          (firstSegmentation.daysSinceLastOrder || 0) ||
        second.customer.totalSpentCents - first.customer.totalSpentCents ||
        first.customer.name.localeCompare(second.customer.name)
      );
    });

  return csvResponse<RetentionRow>({
    filename: `${workspace.store.slug}-customer-retention.csv`,
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
      { header: "retention_priority", value: (row) => row.priority },
      { header: "campaign_type", value: (row) => row.campaignType },
      {
        header: "marketing_eligible",
        value: (row) => row.marketingEligible,
      },
      {
        header: "consent_status",
        value: (row) =>
          row.customer.acceptsMarketing
            ? "Marketing consent recorded"
            : "No marketing consent",
      },
      {
        header: "days_since_last_order",
        value: (row) => getCustomerSegmentation(row.customer).daysSinceLastOrder,
      },
      {
        header: "lifetime_value",
        value: (row) =>
          formatCurrency(row.customer.totalSpentCents, row.customer.currency),
      },
      { header: "orders", value: (row) => row.customer.orderCount },
      { header: "paid_orders", value: (row) => row.customer.paidOrderCount },
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
      { header: "last_order_at", value: (row) => formatDate(row.customer.lastOrderAt) },
      { header: "signals", value: (row) => getSignalLabels(row.customer) },
      {
        header: "recommended_action",
        value: (row) => row.recommendedAction,
      },
      {
        header: "customer_href",
        value: (row) => getCustomerHref(row.storeId, row.customer.email),
      },
    ],
  });
}
