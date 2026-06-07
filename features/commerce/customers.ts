import { isRevenueOrderStatus } from "@/features/commerce/order-status";
import type {
  CustomerProfile,
  CustomerStats,
  CustomerSummary,
  Order,
} from "@/features/commerce/types";

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

export function getCustomerStats(customers: CustomerSummary[]): CustomerStats {
  const paidOrders = customers.reduce(
    (sum, customer) => sum + customer.paidOrderCount,
    0,
  );
  const totalSpentCents = customers.reduce(
    (sum, customer) => sum + customer.totalSpentCents,
    0,
  );

  return {
    totalCustomers: customers.length,
    repeatCustomers: customers.filter((customer) => customer.orderCount > 1)
      .length,
    marketingOptIns: customers.filter((customer) => customer.acceptsMarketing)
      .length,
    paidOrders,
    totalSpentCents,
    averageOrderValueCents:
      paidOrders > 0 ? Math.round(totalSpentCents / paidOrders) : 0,
  };
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
