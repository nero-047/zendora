import { requireAppUser } from "@/features/auth/app-user";
import {
  abandonedCheckoutStatusLabels,
  canQueueAbandonedCheckoutRecovery,
  filterAbandonedCheckouts,
  getAbandonedCheckoutRecoveryHref,
  parseAbandonedCheckoutSortOption,
  parseAbandonedCheckoutStatusFilter,
  readAbandonedCheckoutSearchParam,
  summarizeAbandonedCheckoutLines,
} from "@/features/commerce/abandoned-checkouts";
import { csvResponse } from "@/features/commerce/csv-export";
import { getStoreWorkspace } from "@/features/commerce/data";
import type { AbandonedCheckout } from "@/features/commerce/types";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

type ExportRouteContext = {
  params: Promise<{ storeId: string }>;
};

function readParam(searchParams: URLSearchParams, key: string) {
  return searchParams.get(key) || undefined;
}

function addHours(value: string, hours: number) {
  return new Date(new Date(value).getTime() + hours * 3600000).toISOString();
}

function getRecoveryPriority(checkout: AbandonedCheckout) {
  if (!canQueueAbandonedCheckoutRecovery(checkout)) {
    return "Not eligible";
  }

  if (checkout.subtotalCents >= 20000 && checkout.recoveryEmailCount <= 1) {
    return "High";
  }

  if (checkout.recoveryEmailCount >= 3) {
    return "Manual review";
  }

  return "Medium";
}

function getRecoveryStage(checkout: AbandonedCheckout) {
  if (checkout.status === "recovered") {
    return "Recovered";
  }

  if (checkout.status === "dismissed") {
    return "Dismissed";
  }

  if (!canQueueAbandonedCheckoutRecovery(checkout)) {
    return "Not eligible";
  }

  if (checkout.recoveryEmailCount === 0) {
    return "First recovery";
  }

  if (checkout.recoveryEmailCount === 1) {
    return "Second recovery";
  }

  return "Final review";
}

function getRecoveryCadence(checkout: AbandonedCheckout) {
  if (!canQueueAbandonedCheckoutRecovery(checkout)) {
    return "";
  }

  if (checkout.recoveryEmailCount === 0) {
    return "1-hour first reminder";
  }

  if (checkout.recoveryEmailCount === 1) {
    return "24-hour follow-up";
  }

  return "72-hour manual review";
}

function getNextRecoveryAt(checkout: AbandonedCheckout) {
  if (!canQueueAbandonedCheckoutRecovery(checkout)) {
    return "";
  }

  if (checkout.recoveryEmailCount === 0) {
    return addHours(checkout.lastSeenAt, 1);
  }

  if (checkout.recoveryEmailCount === 1) {
    return addHours(checkout.recoveryEmailSentAt || checkout.lastSeenAt, 24);
  }

  return addHours(checkout.recoveryEmailSentAt || checkout.lastSeenAt, 72);
}

function getSuggestedOffer(checkout: AbandonedCheckout) {
  if (!canQueueAbandonedCheckoutRecovery(checkout)) {
    return "";
  }

  if (checkout.subtotalCents >= 20000 && checkout.recoveryEmailCount > 0) {
    return "Offer WELCOME10 or free shipping before manual outreach.";
  }

  if (checkout.recoveryEmailCount === 0) {
    return "Send recovery link without discount first.";
  }

  return "Send friendly reminder with product summary.";
}

function getRecommendedAction(checkout: AbandonedCheckout) {
  if (checkout.status === "recovered") {
    return "No campaign action needed; checkout already recovered.";
  }

  if (checkout.status === "dismissed") {
    return "No campaign action needed; checkout was dismissed.";
  }

  if (!canQueueAbandonedCheckoutRecovery(checkout)) {
    return "Collect a valid email and cart lines before recovery.";
  }

  if (checkout.recoveryEmailCount === 0) {
    return "Queue the first recovery email with the direct checkout link.";
  }

  if (checkout.recoveryEmailCount === 1) {
    return "Send the second reminder and consider an incentive.";
  }

  return "Review customer context before another recovery message.";
}

function getLineSummary(checkout: AbandonedCheckout) {
  return checkout.lines
    .map((line) => {
      const variant = line.variantName ? ` (${line.variantName})` : "";

      return `${line.quantity} x ${line.productName}${variant}`;
    })
    .join("; ");
}

export async function GET(request: Request, context: ExportRouteContext) {
  const { storeId } = await context.params;
  const user = await requireAppUser();
  const workspace = await getStoreWorkspace(user.id, storeId);

  if (!workspace) {
    return new Response("Store not found.", { status: 404 });
  }

  const searchParams = new URL(request.url).searchParams;
  const rows = filterAbandonedCheckouts({
    checkouts: workspace.abandonedCheckouts,
    query: readAbandonedCheckoutSearchParam(readParam(searchParams, "q")),
    status: parseAbandonedCheckoutStatusFilter(readParam(searchParams, "status")),
    sort: parseAbandonedCheckoutSortOption(readParam(searchParams, "sort")),
  });

  return csvResponse<AbandonedCheckout>({
    filename: `${workspace.store.slug}-checkout-recovery-campaign.csv`,
    rows,
    columns: [
      { header: "checkout_id", value: (checkout) => checkout.id },
      { header: "customer_name", value: (checkout) => checkout.customerName },
      { header: "customer_email", value: (checkout) => checkout.customerEmail },
      {
        header: "status",
        value: (checkout) => abandonedCheckoutStatusLabels[checkout.status],
      },
      { header: "priority", value: getRecoveryPriority },
      { header: "stage", value: getRecoveryStage },
      { header: "cadence", value: getRecoveryCadence },
      { header: "next_recovery_at", value: getNextRecoveryAt },
      { header: "recommended_action", value: getRecommendedAction },
      { header: "suggested_offer", value: getSuggestedOffer },
      {
        header: "eligible",
        value: (checkout) => canQueueAbandonedCheckoutRecovery(checkout),
      },
      {
        header: "recovery_email_count",
        value: (checkout) => checkout.recoveryEmailCount,
      },
      {
        header: "item_count",
        value: (checkout) => summarizeAbandonedCheckoutLines(checkout.lines).itemCount,
      },
      {
        header: "line_count",
        value: (checkout) => summarizeAbandonedCheckoutLines(checkout.lines).lineCount,
      },
      {
        header: "subtotal",
        value: (checkout) =>
          formatCurrency(checkout.subtotalCents, checkout.currency),
      },
      {
        header: "recovery_link",
        value: (checkout) =>
          getAbandonedCheckoutRecoveryHref({
            storeSlug: workspace.store.slug,
            recoveryToken: checkout.recoveryToken,
          }),
      },
      { header: "lines", value: getLineSummary },
      {
        header: "last_seen_at",
        value: (checkout) => new Date(checkout.lastSeenAt).toISOString(),
      },
      {
        header: "recovery_email_sent_at",
        value: (checkout) =>
          checkout.recoveryEmailSentAt
            ? new Date(checkout.recoveryEmailSentAt).toISOString()
            : undefined,
      },
      {
        header: "recovered_order_id",
        value: (checkout) => checkout.recoveredOrderId,
      },
    ],
  });
}
