import { requireAppUser } from "@/features/auth/app-user";
import { csvResponse } from "@/features/commerce/csv-export";
import { getStoreWorkspace } from "@/features/commerce/data";
import {
  giftCardStatusLabels,
  maskGiftCardCode,
} from "@/features/commerce/gift-cards";
import { orderStatusLabels, paymentStatusLabels } from "@/features/commerce/order-status";
import type { DiscountStatus, DiscountType } from "@/features/commerce/types";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

type ExportRouteContext = {
  params: Promise<{ storeId: string }>;
};

type PromotionExportRow = {
  section: string;
  metric: string;
  label: string;
  value: string | number;
  status?: string;
  detail?: string;
  href?: string;
};

const discountStatusLabels: Record<DiscountStatus, string> = {
  active: "Active",
  paused: "Paused",
};

function formatDiscountValue(input: {
  currency: string;
  type: DiscountType;
  value: number;
}) {
  if (input.type === "percent") {
    return `${input.value}% off`;
  }

  return `${formatCurrency(input.value, input.currency)} off`;
}

function formatDate(value: string | undefined) {
  return value ? new Date(value).toISOString() : "";
}

export async function GET(_request: Request, context: ExportRouteContext) {
  const { storeId } = await context.params;
  const user = await requireAppUser();
  const workspace = await getStoreWorkspace(user.id, storeId);

  if (!workspace) {
    return new Response("Store not found.", { status: 404 });
  }

  const { store } = workspace;
  const activeDiscountCount = workspace.discounts.filter(
    (discount) => discount.status === "active",
  ).length;
  const activeGiftCardBalanceCents = workspace.giftCards
    .filter((giftCard) => giftCard.status === "active")
    .reduce((sum, giftCard) => sum + giftCard.balanceCents, 0);
  const discountOrders = workspace.orders.filter(
    (order) => order.discountCode || order.discountCents > 0,
  );
  const giftCardOrders = workspace.orders.filter(
    (order) => order.giftCardCode || order.giftCardCents > 0,
  );

  const rows: PromotionExportRow[] = [
    {
      section: "summary",
      metric: "active_discounts",
      label: "Active discounts",
      value: activeDiscountCount,
      detail: `${workspace.discounts.length} total discount codes`,
    },
    {
      section: "summary",
      metric: "discount_order_usage",
      label: "Orders with discounts",
      value: discountOrders.length,
      detail: formatCurrency(
        discountOrders.reduce((sum, order) => sum + order.discountCents, 0),
        store.currency,
      ),
    },
    {
      section: "summary",
      metric: "active_gift_card_balance",
      label: "Active gift card balance",
      value: formatCurrency(activeGiftCardBalanceCents, store.currency),
      detail: `${workspace.giftCards.length} total gift cards`,
    },
    {
      section: "summary",
      metric: "gift_card_order_usage",
      label: "Orders with gift cards",
      value: giftCardOrders.length,
      detail: formatCurrency(
        giftCardOrders.reduce((sum, order) => sum + order.giftCardCents, 0),
        store.currency,
      ),
    },
    ...workspace.discounts.map((discount) => ({
      section: "discount",
      metric: discount.id,
      label: discount.code,
      value: formatDiscountValue({
        currency: store.currency,
        type: discount.type,
        value: discount.value,
      }),
      status: discountStatusLabels[discount.status],
      detail: [
        discount.minSubtotalCents > 0
          ? `min ${formatCurrency(discount.minSubtotalCents, store.currency)}`
          : "no minimum",
        `${discount.redemptionCount}${discount.usageLimit ? `/${discount.usageLimit}` : ""} redemptions`,
        discount.startsAt ? `starts ${formatDate(discount.startsAt)}` : "",
        discount.endsAt ? `ends ${formatDate(discount.endsAt)}` : "",
      ]
        .filter(Boolean)
        .join(" / "),
    })),
    ...discountOrders.map((order) => ({
      section: "discount_order",
      metric: order.id,
      label: order.discountCode || "Manual discount",
      value: formatCurrency(order.discountCents, order.currency),
      status: orderStatusLabels[order.status],
      detail: [
        order.customerEmail,
        paymentStatusLabels[order.paymentStatus],
        formatDate(order.createdAt),
      ]
        .filter(Boolean)
        .join(" / "),
      href: `/dashboard/stores/${store.id}/orders/${order.id}`,
    })),
    ...workspace.giftCards.map((giftCard) => ({
      section: "gift_card",
      metric: giftCard.id,
      label: maskGiftCardCode(giftCard.code),
      value: formatCurrency(giftCard.balanceCents, giftCard.currency),
      status: giftCardStatusLabels[giftCard.status],
      detail: [
        `initial ${formatCurrency(giftCard.initialBalanceCents, giftCard.currency)}`,
        giftCard.recipientEmail,
        giftCard.expiresAt ? `expires ${formatDate(giftCard.expiresAt)}` : "",
        giftCard.note,
      ]
        .filter(Boolean)
        .join(" / "),
    })),
    ...workspace.giftCards.flatMap((giftCard) =>
      giftCard.redemptions.map((redemption) => ({
        section: "gift_card_redemption",
        metric: redemption.id,
        label: maskGiftCardCode(giftCard.code),
        value: formatCurrency(redemption.amountCents, giftCard.currency),
        status: "redeemed",
        detail: [
          `before ${formatCurrency(redemption.balanceBeforeCents, giftCard.currency)}`,
          `after ${formatCurrency(redemption.balanceAfterCents, giftCard.currency)}`,
          formatDate(redemption.createdAt),
        ]
          .filter(Boolean)
          .join(" / "),
        href: `/dashboard/stores/${store.id}/orders/${redemption.orderId}`,
      })),
    ),
    ...giftCardOrders.map((order) => ({
      section: "gift_card_order",
      metric: order.id,
      label: order.giftCardCode ? maskGiftCardCode(order.giftCardCode) : "Gift card",
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
    })),
  ];

  return csvResponse<PromotionExportRow>({
    filename: `${store.slug}-promotions.csv`,
    rows,
    columns: [
      { header: "section", value: (row) => row.section },
      { header: "metric", value: (row) => row.metric },
      { header: "label", value: (row) => row.label },
      { header: "value", value: (row) => row.value },
      { header: "status", value: (row) => row.status },
      { header: "detail", value: (row) => row.detail },
      { header: "href", value: (row) => row.href },
    ],
  });
}
