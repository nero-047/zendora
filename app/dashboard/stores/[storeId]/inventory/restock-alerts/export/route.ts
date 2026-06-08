import { requireAppUser } from "@/features/auth/app-user";
import { csvResponse } from "@/features/commerce/csv-export";
import { getStoreWorkspace } from "@/features/commerce/data";
import {
  getInventoryPlanningSignals,
  inventoryReorderUrgencyLabels,
  type InventoryPlanningSignal,
} from "@/features/commerce/inventory-planning";
import { getProductHealth } from "@/features/commerce/product-health";
import type {
  AbandonedCheckout,
  CustomerProfile,
  Product,
} from "@/features/commerce/types";

export const dynamic = "force-dynamic";

type ExportRouteContext = {
  params: Promise<{ storeId: string }>;
};

type RestockAlertSource = "open_checkout" | "restock_profile";

type RestockAlertRow = {
  customerEmail: string;
  customerName: string;
  interestSources: Set<RestockAlertSource>;
  lastInterestAt: string;
  marketingEligible: boolean;
  product: Product;
  requestedQuantity: number;
  signal?: InventoryPlanningSignal;
  storeId: string;
};

function normalizeEmail(value: string | undefined) {
  return value?.trim().toLowerCase() || "";
}

function getProfileName(profile: CustomerProfile | undefined, email: string) {
  return profile?.name || email.split("@")[0] || "Customer";
}

function hasRestockInterest(profile: CustomerProfile) {
  const note = profile.note?.toLowerCase() || "";
  const tags = profile.tags.map((tag) => tag.toLowerCase());

  return tags.includes("restock-alert") || note.includes("restock");
}

function isRestockSensitiveProduct(
  product: Product,
  signal: InventoryPlanningSignal | undefined,
) {
  const health = getProductHealth(product);

  return (
    health.issues.some(
      (issue) => issue.id === "out_of_stock" || issue.id === "low_stock",
    ) ||
    signal?.urgency === "out_of_stock" ||
    signal?.urgency === "reorder_now" ||
    signal?.urgency === "watch"
  );
}

function getInventoryStatus(
  product: Product,
  signal: InventoryPlanningSignal | undefined,
) {
  const health = getProductHealth(product);

  if (health.issues.some((issue) => issue.id === "out_of_stock")) {
    return "Out of stock";
  }

  if (health.issues.some((issue) => issue.id === "low_stock")) {
    return "Low stock";
  }

  return signal ? inventoryReorderUrgencyLabels[signal.urgency] : health.label;
}

function getPriority(row: RestockAlertRow) {
  const health = getProductHealth(row.product);

  if (!row.marketingEligible) {
    return "blocked";
  }

  if (health.issues.some((issue) => issue.id === "out_of_stock")) {
    return "critical";
  }

  if (row.interestSources.has("open_checkout")) {
    return "high";
  }

  return "medium";
}

function getRecommendedAction(row: RestockAlertRow) {
  if (!row.marketingEligible) {
    return "Collect marketing consent before promotional restock alerts.";
  }

  if (
    getProductHealth(row.product).issues.some(
      (issue) => issue.id === "out_of_stock",
    )
  ) {
    return "Notify when inventory is received and suppress storefront oversell.";
  }

  if (row.interestSources.has("open_checkout")) {
    return "Send low-stock urgency or reserve-stock follow-up tied to the open cart.";
  }

  return "Queue back-in-stock messaging after replenishment is received.";
}

function getProductHref(storeId: string, productId: string) {
  return `/dashboard/stores/${storeId}/products/${productId}/edit`;
}

function addRow(
  rowsByKey: Map<string, RestockAlertRow>,
  input: Omit<RestockAlertRow, "interestSources"> & {
    source: RestockAlertSource;
  },
) {
  const key = `${input.customerEmail}:${input.product.id}`;
  const current = rowsByKey.get(key);

  if (current) {
    current.interestSources.add(input.source);
    current.requestedQuantity += input.requestedQuantity;

    if (
      new Date(input.lastInterestAt).getTime() >
      new Date(current.lastInterestAt).getTime()
    ) {
      current.lastInterestAt = input.lastInterestAt;
    }

    return;
  }

  rowsByKey.set(key, {
    customerEmail: input.customerEmail,
    customerName: input.customerName,
    interestSources: new Set([input.source]),
    lastInterestAt: input.lastInterestAt,
    marketingEligible: input.marketingEligible,
    product: input.product,
    requestedQuantity: input.requestedQuantity,
    signal: input.signal,
    storeId: input.storeId,
  });
}

function addCheckoutRows(input: {
  checkouts: AbandonedCheckout[];
  profilesByEmail: Map<string, CustomerProfile>;
  rowsByKey: Map<string, RestockAlertRow>;
  restockProductsById: Map<string, Product>;
  signalsByProductId: Map<string, InventoryPlanningSignal>;
  storeId: string;
}) {
  for (const checkout of input.checkouts) {
    if (checkout.status !== "open") {
      continue;
    }

    const email = normalizeEmail(checkout.customerEmail);
    const profile = input.profilesByEmail.get(email);

    for (const line of checkout.lines) {
      const product = input.restockProductsById.get(line.productId);

      if (!product) {
        continue;
      }

      addRow(input.rowsByKey, {
        customerEmail: email,
        customerName: checkout.customerName || getProfileName(profile, email),
        lastInterestAt: checkout.lastSeenAt,
        marketingEligible: profile?.acceptsMarketing ?? true,
        product,
        requestedQuantity: line.quantity,
        signal: input.signalsByProductId.get(product.id),
        source: "open_checkout",
        storeId: input.storeId,
      });
    }
  }
}

function addProfileRows(input: {
  profiles: CustomerProfile[];
  rowsByKey: Map<string, RestockAlertRow>;
  restockProducts: Product[];
  signalsByProductId: Map<string, InventoryPlanningSignal>;
  storeId: string;
}) {
  for (const profile of input.profiles) {
    if (!hasRestockInterest(profile)) {
      continue;
    }

    const email = normalizeEmail(profile.email);

    for (const product of input.restockProducts) {
      addRow(input.rowsByKey, {
        customerEmail: email,
        customerName: getProfileName(profile, email),
        lastInterestAt: profile.updatedAt,
        marketingEligible: profile.acceptsMarketing,
        product,
        requestedQuantity: 0,
        signal: input.signalsByProductId.get(product.id),
        source: "restock_profile",
        storeId: input.storeId,
      });
    }
  }
}

export async function GET(_request: Request, context: ExportRouteContext) {
  const { storeId } = await context.params;
  const user = await requireAppUser();
  const workspace = await getStoreWorkspace(user.id, storeId);

  if (!workspace) {
    return new Response("Store not found.", { status: 404 });
  }

  const signals = getInventoryPlanningSignals({
    products: workspace.products,
    orders: workspace.orders,
    limit: workspace.products.length || 1,
  });
  const signalsByProductId = new Map(
    signals.map((signal) => [signal.productId, signal]),
  );
  const restockProducts = workspace.products.filter((product) =>
    isRestockSensitiveProduct(product, signalsByProductId.get(product.id)),
  );
  const restockProductsById = new Map(
    restockProducts.map((product) => [product.id, product]),
  );
  const profilesByEmail = new Map(
    workspace.customerProfiles.map((profile) => [
      normalizeEmail(profile.email),
      profile,
    ]),
  );
  const rowsByKey = new Map<string, RestockAlertRow>();

  addCheckoutRows({
    checkouts: workspace.abandonedCheckouts,
    profilesByEmail,
    restockProductsById,
    rowsByKey,
    signalsByProductId,
    storeId: workspace.store.id,
  });
  addProfileRows({
    profiles: workspace.customerProfiles,
    restockProducts,
    rowsByKey,
    signalsByProductId,
    storeId: workspace.store.id,
  });

  const rows = [...rowsByKey.values()].sort(
    (first, second) =>
      ["critical", "high", "medium", "blocked"].indexOf(getPriority(first)) -
        ["critical", "high", "medium", "blocked"].indexOf(getPriority(second)) ||
      first.product.name.localeCompare(second.product.name) ||
      first.customerEmail.localeCompare(second.customerEmail),
  );

  return csvResponse<RestockAlertRow>({
    filename: `${workspace.store.slug}-restock-alerts.csv`,
    rows,
    columns: [
      { header: "recipient_email", value: (row) => row.customerEmail },
      { header: "recipient_name", value: (row) => row.customerName },
      { header: "product_id", value: (row) => row.product.id },
      { header: "product_name", value: (row) => row.product.name },
      { header: "sku", value: (row) => row.product.sku },
      {
        header: "interest_source",
        value: (row) => [...row.interestSources].join(" | "),
      },
      {
        header: "marketing_eligible",
        value: (row) => row.marketingEligible,
      },
      {
        header: "priority",
        value: getPriority,
      },
      {
        header: "inventory_status",
        value: (row) => getInventoryStatus(row.product, row.signal),
      },
      {
        header: "sellable_inventory",
        value: (row) => getProductHealth(row.product).sellableInventoryCount,
      },
      {
        header: "requested_quantity",
        value: (row) => row.requestedQuantity,
      },
      {
        header: "reorder_quantity",
        value: (row) => row.signal?.reorderQuantity,
      },
      {
        header: "last_interest_at",
        value: (row) => new Date(row.lastInterestAt).toISOString(),
      },
      {
        header: "recommended_action",
        value: getRecommendedAction,
      },
      {
        header: "product_href",
        value: (row) => getProductHref(row.storeId, row.product.id),
      },
    ],
  });
}
