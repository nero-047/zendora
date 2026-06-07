import { requireAppUser } from "@/features/auth/app-user";
import {
  customerSegmentLabels,
  getCustomerByEmail,
  getCustomerSegmentation,
  getCustomerSummaries,
} from "@/features/commerce/customers";
import { csvResponse } from "@/features/commerce/csv-export";
import { getStoreWorkspace } from "@/features/commerce/data";
import {
  orderSourceLabels,
  orderStatusLabels,
  paymentStatusLabels,
} from "@/features/commerce/order-status";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

type ExportRouteContext = {
  params: Promise<{ storeId: string; customerEmail: string }>;
};

type CustomerExportRow = {
  section: string;
  metric: string;
  label: string;
  value: string | number | boolean;
  detail?: string;
  href?: string;
};

function getOrderItemSummary(
  order: NonNullable<
    ReturnType<typeof getCustomerSummaries>[number]["orders"][number]
  >,
) {
  return (order.items || [])
    .map((item) => {
      const variant = item.variantName ? ` (${item.variantName})` : "";

      return `${item.quantity} x ${item.productName}${variant}`;
    })
    .join("; ");
}

export async function GET(_request: Request, context: ExportRouteContext) {
  const { storeId, customerEmail } = await context.params;
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
  const customer = getCustomerByEmail(
    customers,
    decodeURIComponent(customerEmail),
  );

  if (!customer) {
    return new Response("Customer not found.", { status: 404 });
  }

  const segmentation = getCustomerSegmentation(customer);
  const shipping = customer.latestShippingAddress;
  const rows: CustomerExportRow[] = [
    {
      section: "profile",
      metric: "email",
      label: "Email",
      value: customer.email,
    },
    {
      section: "profile",
      metric: "name",
      label: "Name",
      value: customer.name,
    },
    {
      section: "profile",
      metric: "phone",
      label: "Phone",
      value: customer.phone || "",
    },
    {
      section: "profile",
      metric: "tags",
      label: "Tags",
      value: customer.tags.join(", "),
    },
    {
      section: "profile",
      metric: "accepts_marketing",
      label: "Accepts marketing",
      value: customer.acceptsMarketing,
    },
    {
      section: "profile",
      metric: "tax_exempt",
      label: "Tax exempt",
      value: customer.taxExempt,
    },
    {
      section: "segment",
      metric: "primary_segment",
      label: "Primary segment",
      value: customerSegmentLabels[segmentation.primarySegment],
      detail: segmentation.nextAction,
    },
    {
      section: "segment",
      metric: "average_order_value",
      label: "Average order value",
      value: formatCurrency(
        segmentation.averageOrderValueCents,
        customer.currency,
      ),
    },
    {
      section: "segment",
      metric: "refund_rate",
      label: "Refund rate",
      value: `${segmentation.refundRate}%`,
    },
    {
      section: "summary",
      metric: "orders",
      label: "Orders",
      value: customer.orderCount,
      detail: `${customer.paidOrderCount} paid orders`,
    },
    {
      section: "summary",
      metric: "total_spent",
      label: "Total spent",
      value: formatCurrency(customer.totalSpentCents, customer.currency),
    },
    ...(shipping
      ? [
          {
            section: "shipping",
            metric: "latest_address",
            label: "Latest shipping address",
            value: [
              shipping.line1,
              shipping.line2,
              shipping.city,
              shipping.region,
              shipping.postalCode,
              shipping.country,
            ]
              .filter(Boolean)
              .join(", "),
          },
        ]
      : []),
    ...segmentation.signals.map((signal) => ({
      section: "segment_signal",
      metric: signal.id,
      label: signal.label,
      value: signal.detail,
    })),
    ...customer.orders.map((order) => ({
      section: "order_history",
      metric: order.id,
      label: `Order ${order.id.slice(0, 8)}`,
      value: formatCurrency(order.totalCents, order.currency),
      detail: [
        orderStatusLabels[order.status],
        paymentStatusLabels[order.paymentStatus],
        orderSourceLabels[order.source],
        `${formatCurrency(order.refundedCents, order.currency)} refunded`,
        getOrderItemSummary(order),
      ]
        .filter(Boolean)
        .join(" / "),
      href: `/dashboard/stores/${workspace.store.id}/orders/${order.id}`,
    })),
    ...(customer.note
      ? [
          {
            section: "note",
            metric: "merchant_note",
            label: "Merchant note",
            value: customer.note,
          },
        ]
      : []),
    ...customer.orders
      .filter((order) => order.customerNote)
      .map((order) => ({
        section: "note",
        metric: `order:${order.id}`,
        label: `Order ${order.id.slice(0, 8)} customer note`,
        value: order.customerNote || "",
        href: `/dashboard/stores/${workspace.store.id}/orders/${order.id}`,
      })),
  ];

  return csvResponse<CustomerExportRow>({
    filename: `${workspace.store.slug}-${customer.email}-customer.csv`,
    rows,
    columns: [
      { header: "section", value: (row) => row.section },
      { header: "metric", value: (row) => row.metric },
      { header: "label", value: (row) => row.label },
      { header: "value", value: (row) => row.value },
      { header: "detail", value: (row) => row.detail },
      { header: "href", value: (row) => row.href },
    ],
  });
}
