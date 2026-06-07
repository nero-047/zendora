import { requireAppUser } from "@/features/auth/app-user";
import {
  abandonedCheckoutStatusLabels,
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
    filename: `${workspace.store.slug}-abandoned-checkouts.csv`,
    rows,
    columns: [
      { header: "checkout_id", value: (checkout) => checkout.id },
      { header: "customer_name", value: (checkout) => checkout.customerName },
      { header: "customer_email", value: (checkout) => checkout.customerEmail },
      {
        header: "status",
        value: (checkout) => abandonedCheckoutStatusLabels[checkout.status],
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
        header: "recovery_email_count",
        value: (checkout) => checkout.recoveryEmailCount,
      },
      {
        header: "recovery_link",
        value: (checkout) =>
          getAbandonedCheckoutRecoveryHref({
            storeSlug: workspace.store.slug,
            recoveryToken: checkout.recoveryToken,
          }),
      },
      { header: "recovered_order_id", value: (checkout) => checkout.recoveredOrderId },
      {
        header: "lines",
        value: (checkout) => getLineSummary(checkout),
      },
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
        header: "recovered_at",
        value: (checkout) =>
          checkout.recoveredAt
            ? new Date(checkout.recoveredAt).toISOString()
            : undefined,
      },
      {
        header: "dismissed_at",
        value: (checkout) =>
          checkout.dismissedAt
            ? new Date(checkout.dismissedAt).toISOString()
            : undefined,
      },
      {
        header: "created_at",
        value: (checkout) => new Date(checkout.createdAt).toISOString(),
      },
    ],
  });
}
