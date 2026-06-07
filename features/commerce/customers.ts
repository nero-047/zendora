import { isRevenueOrderStatus } from "@/features/commerce/order-status";
import type {
  CustomerProfile,
  CustomerStats,
  CustomerSummary,
  Order,
} from "@/features/commerce/types";

export type CustomerSegment =
  | "lead"
  | "new"
  | "repeat"
  | "vip"
  | "at_risk"
  | "refund_watch";

export type CustomerSegmentSignal = {
  id: string;
  label: string;
  detail: string;
};

export type CustomerSegmentation = {
  primarySegment: CustomerSegment;
  label: string;
  segments: CustomerSegment[];
  signals: CustomerSegmentSignal[];
  averageOrderValueCents: number;
  refundRate: number;
  daysSinceLastOrder?: number;
  nextAction: string;
};

export const customerSegmentLabels: Record<CustomerSegment, string> = {
  lead: "Lead",
  new: "New customer",
  repeat: "Repeat buyer",
  vip: "VIP",
  at_risk: "At risk",
  refund_watch: "Refund watch",
};

export const customerSegmentFilters = [
  "all",
  "lead",
  "new",
  "repeat",
  "vip",
  "at_risk",
  "refund_watch",
] as const;

export type CustomerSegmentFilter = (typeof customerSegmentFilters)[number];

const VIP_SPEND_THRESHOLD_CENTS = 50000;
const AT_RISK_DAYS = 90;
const NEW_CUSTOMER_DAYS = 30;
const REFUND_WATCH_RATE = 35;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function getCustomerFallbackName(email: string) {
  const [localPart] = email.split("@");
  const words = localPart
    .split(/[\s._-]+/)
    .map((word) => word.trim())
    .filter(Boolean);

  if (words.length === 0) {
    return "Customer";
  }

  return words
    .map((word) => `${word[0]?.toUpperCase() || ""}${word.slice(1)}`)
    .join(" ");
}

function getSortTime(value?: string) {
  if (!value) {
    return 0;
  }

  const time = new Date(value).getTime();

  return Number.isFinite(time) ? time : 0;
}

function sortOrdersNewestFirst(orders: Order[]) {
  return [...orders].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function getCustomerHref(storeId: string, email: string) {
  return `/dashboard/stores/${storeId}/customers/${encodeURIComponent(
    normalizeEmail(email),
  )}`;
}

export function getCustomerSummaries(
  orders: Order[],
  defaultCurrency = "USD",
  profiles: CustomerProfile[] = [],
): CustomerSummary[] {
  const grouped = new Map<string, Order[]>();
  const profilesByEmail = new Map<string, CustomerProfile>();

  for (const order of orders) {
    const email = normalizeEmail(order.customerEmail);

    if (!email) {
      continue;
    }

    grouped.set(email, [...(grouped.get(email) || []), order]);
  }

  for (const profile of profiles) {
    const email = normalizeEmail(profile.email);

    if (!email) {
      continue;
    }

    const current = profilesByEmail.get(email);

    if (
      !current ||
      getSortTime(profile.updatedAt) >= getSortTime(current.updatedAt)
    ) {
      profilesByEmail.set(email, {
        ...profile,
        email,
      });
    }
  }

  const emails = new Set([...grouped.keys(), ...profilesByEmail.keys()]);

  return [...emails]
    .map((email) => {
      const customerOrders = grouped.get(email) || [];
      const profile = profilesByEmail.get(email);
      const sortedOrders = sortOrdersNewestFirst(customerOrders);
      const latestOrder = sortedOrders[0];
      const oldestOrder = sortedOrders[sortedOrders.length - 1];
      const paidOrders = sortedOrders.filter((order) =>
        isRevenueOrderStatus(order.status),
      );
      const contactOrder =
        sortedOrders.find((order) => order.customerPhone) || latestOrder;
      const shippingOrder =
        sortedOrders.find((order) => order.shippingAddress) || latestOrder;

      return {
        profileId: profile?.id,
        email,
        name:
          profile?.name ||
          contactOrder?.customerName ||
          latestOrder?.customerName ||
          getCustomerFallbackName(email),
        phone: profile?.phone || contactOrder?.customerPhone,
        note: profile?.note,
        tags: profile?.tags || [],
        acceptsMarketing: profile?.acceptsMarketing || false,
        taxExempt: profile?.taxExempt || false,
        profileCreatedAt: profile?.createdAt,
        profileUpdatedAt: profile?.updatedAt,
        orderCount: sortedOrders.length,
        paidOrderCount: paidOrders.length,
        totalSpentCents: paidOrders.reduce(
          (sum, order) =>
            sum + Math.max(0, order.totalCents - order.refundedCents),
          0,
        ),
        currency: latestOrder?.currency || defaultCurrency,
        firstOrderAt: oldestOrder?.createdAt,
        lastOrderAt: latestOrder?.createdAt,
        lastOrderStatus: latestOrder?.status,
        latestShippingAddress: shippingOrder?.shippingAddress,
        orders: sortedOrders,
      };
    })
    .sort(
      (a, b) =>
        getSortTime(b.lastOrderAt || b.profileUpdatedAt || b.profileCreatedAt) -
        getSortTime(a.lastOrderAt || a.profileUpdatedAt || a.profileCreatedAt),
    );
}

export function getCustomerByEmail(
  customers: CustomerSummary[],
  email: string,
) {
  const normalizedEmail = normalizeEmail(email);

  return customers.find((customer) => customer.email === normalizedEmail) || null;
}

export function readCustomerSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

export function parseCustomerSegmentFilter(
  value: string | string[] | undefined,
) {
  const segment = Array.isArray(value) ? value[0] : value;

  if (customerSegmentFilters.includes(segment as CustomerSegmentFilter)) {
    return segment as CustomerSegmentFilter;
  }

  return "all";
}

export function getCustomerStats(customers: CustomerSummary[]): CustomerStats {
  const paidOrders = customers.reduce(
    (sum, customer) => sum + customer.paidOrderCount,
    0,
  );
  const totalSpentCents = customers.reduce(
    (sum, customer) => sum + customer.totalSpentCents,
    0,
  );
  const segmentations = customers.map((customer) =>
    getCustomerSegmentation(customer),
  );

  return {
    totalCustomers: customers.length,
    repeatCustomers: customers.filter((customer) => customer.orderCount > 1)
      .length,
    marketingOptIns: customers.filter((customer) => customer.acceptsMarketing)
      .length,
    leads: segmentations.filter(
      (segmentation) => segmentation.primarySegment === "lead",
    ).length,
    vipCustomers: segmentations.filter((segmentation) =>
      segmentation.segments.includes("vip"),
    ).length,
    atRiskCustomers: segmentations.filter((segmentation) =>
      segmentation.segments.includes("at_risk"),
    ).length,
    paidOrders,
    totalSpentCents,
    averageOrderValueCents:
      paidOrders > 0 ? Math.round(totalSpentCents / paidOrders) : 0,
  };
}

function getCustomerDaysSinceLastOrder(customer: CustomerSummary, now: Date) {
  if (!customer.lastOrderAt) {
    return undefined;
  }

  const lastOrderTime = new Date(customer.lastOrderAt).getTime();

  if (!Number.isFinite(lastOrderTime)) {
    return undefined;
  }

  return Math.max(
    0,
    Math.floor((now.getTime() - lastOrderTime) / 86400000),
  );
}

function getCustomerRefundRate(customer: CustomerSummary) {
  if (customer.totalSpentCents <= 0) {
    return 0;
  }

  const refundedCents = customer.orders.reduce(
    (sum, order) => sum + Math.max(0, order.refundedCents),
    0,
  );
  const grossPaidCents = customer.totalSpentCents + refundedCents;

  return grossPaidCents > 0
    ? Math.round((refundedCents / grossPaidCents) * 100)
    : 0;
}

function getCustomerPrimarySegment(segments: CustomerSegment[]) {
  const priority: CustomerSegment[] = [
    "refund_watch",
    "at_risk",
    "vip",
    "repeat",
    "new",
    "lead",
  ];

  return priority.find((segment) => segments.includes(segment)) || "lead";
}

function getCustomerNextAction(input: {
  customer: CustomerSummary;
  daysSinceLastOrder?: number;
  primarySegment: CustomerSegment;
}) {
  if (input.primarySegment === "lead") {
    return input.customer.acceptsMarketing
      ? "Send an onboarding or welcome offer before the first order."
      : "Add consent or context before sending marketing campaigns.";
  }

  if (input.primarySegment === "refund_watch") {
    return "Review recent refunds and support notes before proactive offers.";
  }

  if (input.primarySegment === "at_risk") {
    return `Win back this customer; last order was ${input.daysSinceLastOrder} days ago.`;
  }

  if (input.primarySegment === "vip") {
    return "Prioritize support and early access offers for this high-value customer.";
  }

  if (input.primarySegment === "repeat") {
    return "Recommend complementary products based on their order history.";
  }

  return "Nurture the first purchase with timely order follow-up.";
}

export function getCustomerSegmentation(
  customer: CustomerSummary,
  options: {
    now?: Date;
    vipSpendThresholdCents?: number;
    atRiskDays?: number;
    newCustomerDays?: number;
    refundWatchRate?: number;
  } = {},
): CustomerSegmentation {
  const now = options.now || new Date();
  const vipSpendThresholdCents =
    options.vipSpendThresholdCents ?? VIP_SPEND_THRESHOLD_CENTS;
  const atRiskDays = options.atRiskDays ?? AT_RISK_DAYS;
  const newCustomerDays = options.newCustomerDays ?? NEW_CUSTOMER_DAYS;
  const refundWatchRate = options.refundWatchRate ?? REFUND_WATCH_RATE;
  const daysSinceLastOrder = getCustomerDaysSinceLastOrder(customer, now);
  const refundRate = getCustomerRefundRate(customer);
  const averageOrderValueCents =
    customer.paidOrderCount > 0
      ? Math.round(customer.totalSpentCents / customer.paidOrderCount)
      : 0;
  const normalizedTags = customer.tags.map((tag) => tag.trim().toLowerCase());
  const segments = new Set<CustomerSegment>();
  const signals: CustomerSegmentSignal[] = [];

  if (customer.orderCount === 0) {
    segments.add("lead");
    signals.push({
      id: "profile_only",
      label: "Profile only",
      detail: "No orders are linked to this customer yet.",
    });
  }

  if (customer.paidOrderCount === 1 && (daysSinceLastOrder ?? 0) <= newCustomerDays) {
    segments.add("new");
    signals.push({
      id: "first_order_recent",
      label: "Recent first order",
      detail: "Customer placed their first paid order recently.",
    });
  }

  if (customer.paidOrderCount >= 2) {
    segments.add("repeat");
    signals.push({
      id: "repeat_buyer",
      label: "Repeat buyer",
      detail: `${customer.paidOrderCount} paid orders are linked to this customer.`,
    });
  }

  if (
    customer.totalSpentCents >= vipSpendThresholdCents ||
    normalizedTags.includes("vip")
  ) {
    segments.add("vip");
    signals.push({
      id: "vip_value",
      label: "High value",
      detail: "Customer meets VIP spend or tag criteria.",
    });
  }

  if (
    customer.paidOrderCount > 0 &&
    typeof daysSinceLastOrder === "number" &&
    daysSinceLastOrder >= atRiskDays
  ) {
    segments.add("at_risk");
    signals.push({
      id: "inactive_customer",
      label: "Inactive",
      detail: `No orders in ${daysSinceLastOrder} days.`,
    });
  }

  if (customer.paidOrderCount > 0 && refundRate >= refundWatchRate) {
    segments.add("refund_watch");
    signals.push({
      id: "refund_rate",
      label: "High refund rate",
      detail: `${refundRate}% of paid order value has been refunded.`,
    });
  }

  if (segments.size === 0) {
    segments.add("new");
  }

  const segmentList = [...segments];
  const primarySegment = getCustomerPrimarySegment(segmentList);

  return {
    primarySegment,
    label: customerSegmentLabels[primarySegment],
    segments: segmentList,
    signals,
    averageOrderValueCents,
    refundRate,
    daysSinceLastOrder,
    nextAction: getCustomerNextAction({
      customer,
      daysSinceLastOrder,
      primarySegment,
    }),
  };
}

function getCustomerSearchText(customer: CustomerSummary) {
  const segmentation = getCustomerSegmentation(customer);

  return [
    customer.name,
    customer.email,
    customer.phone,
    customer.note,
    customer.tags.join(" "),
    customer.acceptsMarketing ? "marketing accepts marketing" : "no marketing",
    customer.taxExempt ? "tax exempt" : "",
    segmentation.label,
    segmentation.nextAction,
    ...segmentation.segments.map((segment) => customerSegmentLabels[segment]),
    ...segmentation.signals.flatMap((signal) => [
      signal.label,
      signal.detail,
    ]),
    customer.latestShippingAddress?.line1,
    customer.latestShippingAddress?.line2,
    customer.latestShippingAddress?.city,
    customer.latestShippingAddress?.region,
    customer.latestShippingAddress?.postalCode,
    customer.latestShippingAddress?.country,
    ...customer.orders.flatMap((order) => [
      order.id,
      order.customerName,
      order.customerEmail,
      order.customerPhone,
      order.status,
      order.source,
      order.paymentStatus,
      order.paymentMethod,
      order.discountCode,
      order.shippingAddress?.city,
      order.shippingAddress?.region,
      order.items
        ?.flatMap((item) => [item.productName, item.variantName, item.variantSku])
        .filter(Boolean)
        .join(" "),
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function filterCustomers(input: {
  customers: CustomerSummary[];
  query: string;
  segment: CustomerSegmentFilter;
}) {
  const normalizedQuery = input.query.trim().toLowerCase();

  return input.customers.filter((customer) => {
    const segmentation = getCustomerSegmentation(customer);
    const segmentMatches =
      input.segment === "all" ||
      segmentation.segments.includes(input.segment as CustomerSegment);
    const queryMatches =
      !normalizedQuery ||
      getCustomerSearchText(customer).includes(normalizedQuery);

    return segmentMatches && queryMatches;
  });
}

export function parseCustomerTags(value: string) {
  const tags: string[] = [];
  const seen = new Set<string>();

  for (const rawTag of value.split(/[,\n]/)) {
    const tag = rawTag.trim().replace(/\s+/g, " ");

    if (!tag) {
      continue;
    }

    const normalized = tag.toLowerCase();

    if (seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    tags.push(tag);
  }

  return tags.slice(0, 20);
}

export function formatCustomerTags(tags: string[]) {
  return tags.join(", ");
}
