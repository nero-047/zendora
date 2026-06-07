import { isRevenueOrderStatus } from "@/features/commerce/order-status";
import type {
  CustomerStats,
  CustomerSummary,
  Order,
} from "@/features/commerce/types";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
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
): CustomerSummary[] {
  const grouped = new Map<string, Order[]>();

  for (const order of orders) {
    const email = normalizeEmail(order.customerEmail);

    if (!email) {
      continue;
    }

    grouped.set(email, [...(grouped.get(email) || []), order]);
  }

  return [...grouped.entries()]
    .map(([email, customerOrders]) => {
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
        email,
        name: contactOrder.customerName || latestOrder.customerName,
        phone: contactOrder.customerPhone,
        orderCount: sortedOrders.length,
        paidOrderCount: paidOrders.length,
        totalSpentCents: paidOrders.reduce(
          (sum, order) => sum + order.totalCents,
          0,
        ),
        currency: latestOrder.currency || defaultCurrency,
        firstOrderAt: oldestOrder.createdAt,
        lastOrderAt: latestOrder.createdAt,
        lastOrderStatus: latestOrder.status,
        latestShippingAddress: shippingOrder.shippingAddress,
        orders: sortedOrders,
      };
    })
    .sort(
      (a, b) =>
        new Date(b.lastOrderAt).getTime() - new Date(a.lastOrderAt).getTime(),
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
    paidOrders,
    totalSpentCents,
    averageOrderValueCents:
      paidOrders > 0 ? Math.round(totalSpentCents / paidOrders) : 0,
  };
}
