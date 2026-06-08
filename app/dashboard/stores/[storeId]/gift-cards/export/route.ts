import { requireAppUser } from "@/features/auth/app-user";
import { csvResponse } from "@/features/commerce/csv-export";
import { getStoreWorkspace } from "@/features/commerce/data";
import {
  giftCardStatusLabels,
  maskGiftCardCode,
  normalizeGiftCardCode,
} from "@/features/commerce/gift-cards";
import { orderStatusLabels, paymentStatusLabels } from "@/features/commerce/order-status";
import type { GiftCard, GiftCardRedemption, Order } from "@/features/commerce/types";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

type ExportRouteContext = {
  params: Promise<{ storeId: string }>;
};

type GiftCardLedgerRow = {
  section: "summary" | "gift_card" | "redemption" | "order_usage";
  metric: string;
  giftCard?: GiftCard;
  redemption?: GiftCardRedemption;
  order?: Order;
  label: string;
  value: string | number;
  status?: string;
  detail?: string;
  href?: string;
};

function formatDate(value: string | undefined) {
  return value ? new Date(value).toISOString() : "";
}

function getRedeemedCents(giftCard: GiftCard) {
  return giftCard.redemptions.reduce(
    (sum, redemption) => sum + redemption.amountCents,
    0,
  );
}

function getGiftCardOrders(orders: Order[], giftCard: GiftCard) {
  const normalizedCode = normalizeGiftCardCode(giftCard.code);

  return orders.filter(
    (order) =>
      order.giftCardCents > 0 &&
      normalizeGiftCardCode(order.giftCardCode) === normalizedCode,
  );
}

export async function GET(_request: Request, context: ExportRouteContext) {
  const { storeId } = await context.params;
  const user = await requireAppUser();
  const workspace = await getStoreWorkspace(user.id, storeId);

  if (!workspace) {
    return new Response("Store not found.", { status: 404 });
  }

  const { store } = workspace;
  const activeGiftCards = workspace.giftCards.filter(
    (giftCard) => giftCard.status === "active",
  );
  const totalInitialBalanceCents = workspace.giftCards.reduce(
    (sum, giftCard) => sum + giftCard.initialBalanceCents,
    0,
  );
  const activeBalanceCents = activeGiftCards.reduce(
    (sum, giftCard) => sum + giftCard.balanceCents,
    0,
  );
  const totalRedeemedCents = workspace.giftCards.reduce(
    (sum, giftCard) => sum + getRedeemedCents(giftCard),
    0,
  );

  const rows: GiftCardLedgerRow[] = [
    {
      section: "summary",
      metric: "gift_cards",
      label: "Gift cards",
      value: workspace.giftCards.length,
      status: `${activeGiftCards.length} active`,
      detail: `${workspace.giftCards.length - activeGiftCards.length} inactive`,
    },
    {
      section: "summary",
      metric: "initial_balance",
      label: "Initial balance",
      value: formatCurrency(totalInitialBalanceCents, store.currency),
      detail: "Total issued value",
    },
    {
      section: "summary",
      metric: "active_balance",
      label: "Active balance",
      value: formatCurrency(activeBalanceCents, store.currency),
      detail: "Outstanding active liability",
    },
    {
      section: "summary",
      metric: "redeemed_balance",
      label: "Redeemed balance",
      value: formatCurrency(totalRedeemedCents, store.currency),
      detail: "Recorded gift-card redemptions",
    },
    ...workspace.giftCards
      .slice()
      .sort((first, second) =>
        maskGiftCardCode(first.code).localeCompare(maskGiftCardCode(second.code)),
      )
      .flatMap((giftCard) => {
        const redeemedCents = getRedeemedCents(giftCard);
        const giftCardOrders = getGiftCardOrders(workspace.orders, giftCard);
        const giftCardRow: GiftCardLedgerRow = {
          section: "gift_card",
          metric: giftCard.id,
          giftCard,
          label: maskGiftCardCode(giftCard.code),
          value: formatCurrency(giftCard.balanceCents, giftCard.currency),
          status: giftCardStatusLabels[giftCard.status],
          detail: [
            `initial ${formatCurrency(giftCard.initialBalanceCents, giftCard.currency)}`,
            `redeemed ${formatCurrency(redeemedCents, giftCard.currency)}`,
            `${giftCard.redemptions.length} redemptions`,
            giftCard.recipientEmail,
            giftCard.expiresAt ? `expires ${formatDate(giftCard.expiresAt)}` : "",
            giftCard.note,
          ]
            .filter(Boolean)
            .join(" / "),
        };
        const redemptionRows = giftCard.redemptions.map((redemption) => ({
          section: "redemption" as const,
          metric: redemption.id,
          giftCard,
          redemption,
          label: maskGiftCardCode(giftCard.code),
          value: formatCurrency(redemption.amountCents, giftCard.currency),
          status: "Redeemed",
          detail: [
            `before ${formatCurrency(redemption.balanceBeforeCents, giftCard.currency)}`,
            `after ${formatCurrency(redemption.balanceAfterCents, giftCard.currency)}`,
            formatDate(redemption.createdAt),
          ]
            .filter(Boolean)
            .join(" / "),
          href: `/dashboard/stores/${store.id}/orders/${redemption.orderId}`,
        }));
        const orderRows = giftCardOrders.map((order) => ({
          section: "order_usage" as const,
          metric: order.id,
          giftCard,
          order,
          label: maskGiftCardCode(giftCard.code),
          value: formatCurrency(order.giftCardCents, order.currency),
          status: orderStatusLabels[order.status],
          detail: [
            order.customerEmail,
            paymentStatusLabels[order.paymentStatus],
            formatDate(order.createdAt),
          ]
            .filter(Boolean)
            .join(" / "),
          href: `/dashboard/stores/${store.id}/orders/${order.id}`,
        }));

        return [giftCardRow, ...redemptionRows, ...orderRows];
      }),
  ];

  return csvResponse<GiftCardLedgerRow>({
    filename: `${store.slug}-gift-card-ledger.csv`,
    rows,
    columns: [
      { header: "section", value: (row) => row.section },
      { header: "metric", value: (row) => row.metric },
      { header: "gift_card_id", value: (row) => row.giftCard?.id },
      {
        header: "code",
        value: (row) => (row.giftCard ? maskGiftCardCode(row.giftCard.code) : ""),
      },
      { header: "label", value: (row) => row.label },
      { header: "value", value: (row) => row.value },
      { header: "status", value: (row) => row.status },
      {
        header: "initial_balance",
        value: (row) =>
          row.giftCard
            ? formatCurrency(row.giftCard.initialBalanceCents, row.giftCard.currency)
            : "",
      },
      {
        header: "current_balance",
        value: (row) =>
          row.giftCard
            ? formatCurrency(row.giftCard.balanceCents, row.giftCard.currency)
            : "",
      },
      {
        header: "redemption_amount",
        value: (row) =>
          row.redemption
            ? formatCurrency(row.redemption.amountCents, row.giftCard?.currency)
            : "",
      },
      {
        header: "balance_before",
        value: (row) =>
          row.redemption
            ? formatCurrency(row.redemption.balanceBeforeCents, row.giftCard?.currency)
            : "",
      },
      {
        header: "balance_after",
        value: (row) =>
          row.redemption
            ? formatCurrency(row.redemption.balanceAfterCents, row.giftCard?.currency)
            : "",
      },
      {
        header: "redemption_count",
        value: (row) => row.giftCard?.redemptions.length,
      },
      {
        header: "recipient_email",
        value: (row) => row.giftCard?.recipientEmail,
      },
      { header: "order_id", value: (row) => row.order?.id || row.redemption?.orderId },
      { header: "customer_email", value: (row) => row.order?.customerEmail },
      { header: "detail", value: (row) => row.detail },
      { header: "expires_at", value: (row) => formatDate(row.giftCard?.expiresAt) },
      { header: "created_at", value: (row) => formatDate(row.giftCard?.createdAt) },
      { header: "updated_at", value: (row) => formatDate(row.giftCard?.updatedAt) },
      { header: "href", value: (row) => row.href },
    ],
  });
}
