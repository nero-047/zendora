import { requireAppUser } from "@/features/auth/app-user";
import {
  canQueueAbandonedCheckoutRecovery,
  getAbandonedCheckoutRecoveryHref,
  summarizeAbandonedCheckoutLines,
} from "@/features/commerce/abandoned-checkouts";
import {
  customerSegmentLabels,
  type CustomerSegment,
  getCustomerHref,
  getCustomerSegmentation,
  getCustomerSummaries,
} from "@/features/commerce/customers";
import { csvResponse } from "@/features/commerce/csv-export";
import { getStoreWorkspace } from "@/features/commerce/data";
import type {
  AbandonedCheckout,
  CustomerSummary,
} from "@/features/commerce/types";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

type ExportRouteContext = {
  params: Promise<{ storeId: string }>;
};

type MarketingAudienceRow = {
  audience: "customer" | "checkout_recovery";
  recipientEmail: string;
  recipientName: string;
  consent: boolean;
  campaign: string;
  priority: "critical" | "high" | "medium" | "review";
  segment: string;
  campaignEligible: boolean;
  reason: string;
  nextAction: string;
  customer?: CustomerSummary;
  checkout?: AbandonedCheckout;
  href: string;
};

function normalizeEmail(value: string | undefined) {
  return value?.trim().toLowerCase() || "";
}

function getCustomerCampaign(segment: CustomerSegment) {
  if (segment === "lead") {
    return "Welcome offer";
  }

  if (segment === "vip") {
    return "VIP early access";
  }

  if (segment === "at_risk") {
    return "Win-back";
  }

  if (segment === "refund_watch") {
    return "Support review";
  }

  if (segment === "repeat") {
    return "Product recommendation";
  }

  return "Post-purchase nurture";
}

function getCustomerPriority(segment: CustomerSegment) {
  if (segment === "refund_watch") {
    return "review" as const;
  }

  if (segment === "at_risk" || segment === "vip") {
    return "high" as const;
  }

  return "medium" as const;
}

function getCustomerReason(customer: CustomerSummary) {
  const segmentation = getCustomerSegmentation(customer);

  if (!customer.acceptsMarketing) {
    return "No marketing consent recorded.";
  }

  return segmentation.signals.map((signal) => signal.detail).join(" ") ||
    segmentation.label;
}

function getCheckoutPriority(checkout: AbandonedCheckout) {
  if (checkout.subtotalCents >= 20000 && checkout.recoveryEmailCount <= 1) {
    return "critical" as const;
  }

  return "high" as const;
}

function getCheckoutNextAction(checkout: AbandonedCheckout) {
  if (checkout.recoveryEmailCount === 0) {
    return "Queue first recovery email with the cart permalink.";
  }

  if (checkout.recoveryEmailCount === 1) {
    return "Send the second reminder and consider WELCOME10 or free shipping.";
  }

  return "Review customer context before another recovery message.";
}

function getCustomerRows(input: {
  customers: CustomerSummary[];
  storeId: string;
}): MarketingAudienceRow[] {
  return input.customers.map((customer) => {
    const segmentation = getCustomerSegmentation(customer);
    const campaignEligible =
      customer.acceptsMarketing && segmentation.primarySegment !== "refund_watch";

    return {
      audience: "customer",
      recipientEmail: customer.email,
      recipientName: customer.name,
      consent: customer.acceptsMarketing,
      campaign: getCustomerCampaign(segmentation.primarySegment),
      priority: getCustomerPriority(segmentation.primarySegment),
      segment: customerSegmentLabels[segmentation.primarySegment],
      campaignEligible,
      reason: getCustomerReason(customer),
      nextAction: campaignEligible
        ? segmentation.nextAction
        : "Do not send promotional campaigns until consent and customer context are safe.",
      customer,
      href: getCustomerHref(input.storeId, customer.email),
    };
  });
}

function getCheckoutRows(input: {
  checkouts: AbandonedCheckout[];
  customersByEmail: Map<string, CustomerSummary>;
  storeSlug: string;
}): MarketingAudienceRow[] {
  return input.checkouts
    .filter((checkout) => canQueueAbandonedCheckoutRecovery(checkout))
    .map((checkout) => {
      const customer = input.customersByEmail.get(
        normalizeEmail(checkout.customerEmail),
      );

      return {
        audience: "checkout_recovery",
        recipientEmail: normalizeEmail(checkout.customerEmail),
        recipientName: checkout.customerName || customer?.name || "Guest customer",
        consent: customer?.acceptsMarketing || false,
        campaign: "Cart recovery",
        priority: getCheckoutPriority(checkout),
        segment: customer
          ? customerSegmentLabels[getCustomerSegmentation(customer).primarySegment]
          : "Lead",
        campaignEligible: true,
        reason: `${summarizeAbandonedCheckoutLines(checkout.lines).itemCount} cart items abandoned.`,
        nextAction: getCheckoutNextAction(checkout),
        customer,
        checkout,
        href: getAbandonedCheckoutRecoveryHref({
          storeSlug: input.storeSlug,
          recoveryToken: checkout.recoveryToken,
        }),
      };
    });
}

export async function GET(_request: Request, context: ExportRouteContext) {
  const { storeId } = await context.params;
  const user = await requireAppUser();
  const workspace = await getStoreWorkspace(user.id, storeId);

  if (!workspace) {
    return new Response("Store not found.", { status: 404 });
  }

  const customers = getCustomerSummaries(
    workspace.orders,
    workspace.store.currency,
    workspace.customerProfiles,
  );
  const customersByEmail = new Map(
    customers.map((customer) => [normalizeEmail(customer.email), customer]),
  );
  const rows = [
    ...getCheckoutRows({
      checkouts: workspace.abandonedCheckouts,
      customersByEmail,
      storeSlug: workspace.store.slug,
    }),
    ...getCustomerRows({
      customers,
      storeId: workspace.store.id,
    }),
  ].sort(
    (first, second) =>
      ["critical", "high", "medium", "review"].indexOf(first.priority) -
        ["critical", "high", "medium", "review"].indexOf(second.priority) ||
      first.recipientEmail.localeCompare(second.recipientEmail),
  );

  return csvResponse<MarketingAudienceRow>({
    filename: `${workspace.store.slug}-marketing-audience.csv`,
    rows,
    columns: [
      { header: "audience", value: (row) => row.audience },
      { header: "recipient_email", value: (row) => row.recipientEmail },
      { header: "recipient_name", value: (row) => row.recipientName },
      { header: "consent", value: (row) => row.consent },
      { header: "campaign", value: (row) => row.campaign },
      { header: "priority", value: (row) => row.priority },
      { header: "segment", value: (row) => row.segment },
      { header: "campaign_eligible", value: (row) => row.campaignEligible },
      { header: "reason", value: (row) => row.reason },
      { header: "next_action", value: (row) => row.nextAction },
      { header: "order_count", value: (row) => row.customer?.orderCount },
      {
        header: "total_spent",
        value: (row) =>
          row.customer
            ? formatCurrency(row.customer.totalSpentCents, row.customer.currency)
            : "",
      },
      {
        header: "average_order_value",
        value: (row) =>
          row.customer
            ? formatCurrency(
                getCustomerSegmentation(row.customer).averageOrderValueCents,
                row.customer.currency,
              )
            : "",
      },
      {
        header: "refund_rate",
        value: (row) =>
          row.customer ? getCustomerSegmentation(row.customer).refundRate : "",
      },
      {
        header: "days_since_last_order",
        value: (row) =>
          row.customer
            ? getCustomerSegmentation(row.customer).daysSinceLastOrder
            : "",
      },
      {
        header: "cart_value",
        value: (row) =>
          row.checkout
            ? formatCurrency(row.checkout.subtotalCents, row.checkout.currency)
            : "",
      },
      {
        header: "cart_items",
        value: (row) =>
          row.checkout
            ? summarizeAbandonedCheckoutLines(row.checkout.lines).itemCount
            : "",
      },
      {
        header: "recovery_email_count",
        value: (row) => row.checkout?.recoveryEmailCount,
      },
      {
        header: "last_activity_at",
        value: (row) =>
          new Date(
            row.checkout?.lastSeenAt ||
              row.customer?.lastOrderAt ||
              row.customer?.profileUpdatedAt ||
              row.customer?.profileCreatedAt ||
              "",
          ).toISOString(),
      },
      { header: "href", value: (row) => row.href },
    ],
  });
}
