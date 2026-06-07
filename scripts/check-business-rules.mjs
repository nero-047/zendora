import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import ts from "typescript";

const require = createRequire(import.meta.url);
const moduleCache = new Map();

function loadTsModule(relativePath) {
  const absolutePath = resolve(relativePath);

  if (moduleCache.has(absolutePath)) {
    return moduleCache.get(absolutePath).exports;
  }

  const source = readFileSync(absolutePath, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: absolutePath,
  });
  const cjsModule = { exports: {} };

  moduleCache.set(absolutePath, cjsModule);

  const localRequire = (id) => {
    if (id.startsWith("@/")) {
      const withoutAlias = id.slice(2);
      const candidates = [
        `${withoutAlias}.ts`,
        `${withoutAlias}.tsx`,
        `${withoutAlias}.js`,
      ];

      for (const candidate of candidates) {
        try {
          return loadTsModule(candidate);
        } catch {
          // Try the next extension.
        }
      }
    }

    return require(id);
  };

  const run = new Function("require", "module", "exports", outputText);
  run(localRequire, cjsModule, cjsModule.exports);

  return cjsModule.exports;
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function assertDeepEqual(actual, expected, message) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);

  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}

function assertTrue(value, message) {
  if (!value) {
    throw new Error(message);
  }
}

function assertFalse(value, message) {
  if (value) {
    throw new Error(message);
  }
}

const businessRules = loadTsModule("features/commerce/business-rules.ts");
const analytics = loadTsModule("features/commerce/analytics.ts");
const orderStatus = loadTsModule("features/commerce/order-status.ts");
const orderHelpers = loadTsModule("features/commerce/orders.ts");
const policies = loadTsModule("features/commerce/policies.ts");
const storePages = loadTsModule("features/commerce/store-pages.ts");
const seo = loadTsModule("features/commerce/seo.ts");
const payments = loadTsModule("features/commerce/payments.ts");
const orderInsights = loadTsModule("features/commerce/order-insights.ts");
const productHealth = loadTsModule("features/commerce/product-health.ts");
const productHelpers = loadTsModule("features/commerce/products.ts");
const inventoryPlanning = loadTsModule("features/commerce/inventory-planning.ts");
const returns = loadTsModule("features/commerce/returns.ts");
const reviews = loadTsModule("features/commerce/reviews.ts");
const giftCards = loadTsModule("features/commerce/gift-cards.ts");
const fulfillments = loadTsModule("features/commerce/fulfillments.ts");
const customers = loadTsModule("features/commerce/customers.ts");
const navigation = loadTsModule("features/commerce/navigation.ts");
const cartPermalinks = loadTsModule("features/commerce/cart-permalinks.ts");
const catalogFilters = loadTsModule("features/commerce/catalog-filters.ts");
const pagination = loadTsModule("features/commerce/pagination.ts");
const launchReadiness = loadTsModule("features/commerce/launch-readiness.ts");
const storeInsights = loadTsModule("features/commerce/store-insights.ts");
const activityCenter = loadTsModule("features/commerce/activity-center.ts");
const abandonedCheckouts = loadTsModule(
  "features/commerce/abandoned-checkouts.ts",
);
const permissions = loadTsModule("features/commerce/permissions.ts");
const requestGuards = loadTsModule("lib/request-guards.ts");
const runtimeEnv = loadTsModule("lib/env.ts");
const mockData = loadTsModule("features/commerce/mock-data.ts");

const tests = [
  [
    "product health identifies sellable catalog items and merchant fixes",
    () => {
      const makeProduct = (overrides = {}) => ({
        id: "product_ready",
        storeId: "store_1",
        name: "Apex Jacket",
        slug: "apex-jacket",
        sku: "APX-JKT-001",
        category: "Outerwear",
        description: "Weatherproof shell jacket with taped seams and daily carry pockets.",
        priceCents: 12900,
        currency: "USD",
        inventoryCount: 24,
        imageUrl: "https://example.com/jacket.jpg",
        status: "active",
        createdAt: "2026-06-01T10:00:00.000Z",
        variants: [],
        ...overrides,
      });

      const readyHealth = productHealth.getProductHealth(makeProduct());

      assertEqual(
        readyHealth.status,
        "ready",
        "complete active products should be ready to sell",
      );
      assertEqual(
        readyHealth.sellableInventoryCount,
        24,
        "base product stock should count as sellable inventory",
      );

      const variantHealth = productHealth.getProductHealth(
        makeProduct({
          id: "product_variant",
          inventoryCount: 0,
          variants: [
            {
              id: "variant_low",
              storeId: "store_1",
              productId: "product_variant",
              optionName: "Size",
              optionValue: "M",
              sku: "APX-JKT-M",
              priceCents: 13900,
              currency: "USD",
              inventoryCount: 3,
              status: "active",
              sortOrder: 1,
              createdAt: "2026-06-01T10:00:00.000Z",
            },
            {
              id: "variant_paused",
              storeId: "store_1",
              productId: "product_variant",
              optionName: "Size",
              optionValue: "L",
              sku: "APX-JKT-L",
              priceCents: 13900,
              currency: "USD",
              inventoryCount: 10,
              status: "paused",
              sortOrder: 2,
              createdAt: "2026-06-01T10:00:00.000Z",
            },
          ],
        }),
        { lowStockThreshold: 5 },
      );

      assertEqual(
        variantHealth.status,
        "needs_attention",
        "low-stock variant products should be flagged for merchant review",
      );
      assertEqual(
        variantHealth.sellableInventoryCount,
        3,
        "only active priced variant stock should count as sellable",
      );
      assertDeepEqual(
        variantHealth.issues.map((issue) => issue.id),
        ["paused_variants", "low_stock"],
        "variant health should explain paused variants and low stock",
      );

      const brokenHealth = productHealth.getProductHealth(
        makeProduct({
          id: "product_broken",
          slug: "",
          sku: "",
          category: "",
          description: "Tiny",
          priceCents: 0,
          inventoryCount: 0,
          imageUrl: "",
        }),
      );

      assertEqual(
        brokenHealth.status,
        "needs_attention",
        "active products with blockers should need attention",
      );
      assertDeepEqual(
        brokenHealth.issues.map((issue) => issue.id),
        [
          "missing_slug",
          "missing_image",
          "short_description",
          "missing_category",
          "missing_sku",
          "missing_price",
          "out_of_stock",
        ],
        "broken product health should list the merchant fixes in order",
      );

      assertEqual(
        productHealth.getProductHealth(makeProduct({ status: "draft" })).status,
        "not_listed",
        "draft products should be classified as not listed",
      );
    },
  ],
  [
    "dashboard pagination clamps pages and preserves list filters",
    () => {
      const items = Array.from({ length: 23 }, (_, index) => index + 1);

      assertEqual(
        pagination.parseDashboardPage("0"),
        1,
        "invalid pages should fall back to the first page",
      );
      assertEqual(
        pagination.parseDashboardPage(["3", "4"]),
        3,
        "repeated page params should use the first value",
      );
      assertEqual(
        pagination.parseDashboardPageSize("999"),
        10,
        "unsupported page sizes should fall back to the dashboard default",
      );
      assertEqual(
        pagination.parseDashboardPageSize("25"),
        25,
        "supported page sizes should be accepted",
      );

      const secondPage = pagination.paginateItems({
        items,
        page: 2,
        pageSize: 10,
      });
      const clampedPage = pagination.paginateItems({
        items,
        page: 99,
        pageSize: 10,
      });
      const emptyPage = pagination.paginateItems({
        items: [],
        page: 2,
        pageSize: 10,
      });

      assertDeepEqual(
        secondPage.items,
        [11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
        "pagination should slice the requested page",
      );
      assertEqual(secondPage.startItem, 11, "pagination should expose the first visible row");
      assertEqual(secondPage.endItem, 20, "pagination should expose the last visible row");
      assertEqual(secondPage.totalPages, 3, "pagination should expose total pages");
      assertTrue(secondPage.hasPreviousPage, "middle pages should have previous links");
      assertTrue(secondPage.hasNextPage, "middle pages should have next links");
      assertEqual(clampedPage.page, 3, "oversized page requests should clamp to the last page");
      assertDeepEqual(
        clampedPage.items,
        [21, 22, 23],
        "clamped pages should return the final rows",
      );
      assertEqual(emptyPage.page, 1, "empty lists should settle on page one");
      assertEqual(emptyPage.startItem, 0, "empty lists should not expose a start row");
      assertEqual(emptyPage.endItem, 0, "empty lists should not expose an end row");

      assertEqual(
        pagination.buildDashboardPageHref({
          basePath: "/dashboard/stores/store_1/products",
          params: {
            q: "bottle",
            status: "active",
            category: "",
            page: "3",
            pageSize: "25",
          },
          page: 1,
          pageSize: 10,
        }),
        "/dashboard/stores/store_1/products?q=bottle&status=active",
        "default pagination params should be omitted from first-page links",
      );
      assertEqual(
        pagination.buildDashboardPageHref({
          basePath: "/dashboard/stores/store_1/orders",
          params: {
            q: ["mira", "ari"],
            risk: "high",
            page: "1",
          },
          page: 2,
          pageSize: 25,
        }),
        "/dashboard/stores/store_1/orders?q=mira&q=ari&risk=high&page=2&pageSize=25",
        "pagination links should preserve repeated filters and non-default page size",
      );
    },
  ],
  [
    "product catalog filters triage health, inventory urgency, and sort priority",
    () => {
      const makeProduct = (overrides = {}) => ({
        id: "product_ready",
        storeId: "store_1",
        name: "Ready Pack",
        slug: "ready-pack",
        sku: "READY-1",
        category: "Bags",
        description: "A complete product ready for customer traffic.",
        priceCents: 10000,
        currency: "USD",
        inventoryCount: 24,
        imageUrl: "https://example.com/ready.jpg",
        status: "active",
        createdAt: "2026-06-01T10:00:00.000Z",
        variants: [],
        ...overrides,
      });
      const products = [
        makeProduct(),
        makeProduct({
          id: "product_broken",
          name: "Broken Draft",
          slug: "",
          sku: "",
          category: "",
          description: "Tiny",
          priceCents: 0,
          inventoryCount: 0,
          imageUrl: "",
          createdAt: "2026-06-03T10:00:00.000Z",
        }),
        makeProduct({
          id: "product_draft",
          name: "Draft Bottle",
          slug: "draft-bottle",
          category: "Drinkware",
          inventoryCount: 1,
          status: "draft",
          createdAt: "2026-06-04T10:00:00.000Z",
        }),
        makeProduct({
          id: "product_reorder",
          name: "Velocity Jacket",
          slug: "velocity-jacket",
          category: "Outerwear",
          priceCents: 50000,
          inventoryCount: 14,
          createdAt: "2026-06-02T10:00:00.000Z",
        }),
      ];
      const inventorySignalsByProduct = new Map([
        [
          "product_ready",
          {
            productId: "product_ready",
            urgency: "healthy",
            estimatedDaysUntilStockout: 60,
            soldQuantity: 4,
          },
        ],
        [
          "product_broken",
          {
            productId: "product_broken",
            urgency: "out_of_stock",
            soldQuantity: 0,
          },
        ],
        [
          "product_draft",
          {
            productId: "product_draft",
            urgency: "not_tracked",
            soldQuantity: 0,
          },
        ],
        [
          "product_reorder",
          {
            productId: "product_reorder",
            urgency: "reorder_now",
            estimatedDaysUntilStockout: 4,
            soldQuantity: 12,
          },
        ],
      ]);

      assertEqual(
        productHelpers.parseProductHealthFilter("broken"),
        "all",
        "invalid health filters should fall back to all",
      );
      assertEqual(
        productHelpers.parseProductInventoryUrgencyFilter("soon"),
        "all",
        "invalid inventory filters should fall back to all",
      );
      assertEqual(
        productHelpers.parseProductSortOption("random"),
        "reorder_priority",
        "invalid product sort should fall back to reorder priority",
      );
      assertDeepEqual(
        productHelpers.getProductCategories(products),
        ["Bags", "Drinkware", "Outerwear"],
        "product categories should be unique and alphabetized",
      );
      assertDeepEqual(
        productHelpers
          .filterProducts({
            products,
            query: "",
            status: "all",
            category: "",
            health: "needs_attention",
            inventory: "all",
            sort: "health_priority",
            inventorySignalsByProduct,
          })
          .map((product) => product.id),
        ["product_broken"],
        "health filters should isolate products with launch blockers",
      );
      assertDeepEqual(
        productHelpers
          .filterProducts({
            products,
            query: "",
            status: "all",
            category: "",
            health: "all",
            inventory: "reorder_now",
            sort: "reorder_priority",
            inventorySignalsByProduct,
          })
          .map((product) => product.id),
        ["product_reorder"],
        "inventory urgency filters should isolate reorder work",
      );
      assertDeepEqual(
        productHelpers
          .filterProducts({
            products,
            query: "missing image",
            status: "all",
            category: "",
            health: "all",
            inventory: "all",
            sort: "reorder_priority",
            inventorySignalsByProduct,
          })
          .map((product) => product.id),
        ["product_broken"],
        "catalog search should include health issue labels",
      );
      assertDeepEqual(
        productHelpers
          .filterProducts({
            products,
            query: "",
            status: "all",
            category: "",
            health: "all",
            inventory: "all",
            sort: "reorder_priority",
            inventorySignalsByProduct,
          })
          .map((product) => product.id),
        [
          "product_broken",
          "product_reorder",
          "product_ready",
          "product_draft",
        ],
        "reorder priority sort should put urgent inventory work first",
      );
      assertDeepEqual(
        productHelpers
          .filterProducts({
            products,
            query: "",
            status: "all",
            category: "",
            health: "all",
            inventory: "all",
            sort: "value_desc",
            inventorySignalsByProduct,
          })
          .map((product) => product.id),
        [
          "product_reorder",
          "product_ready",
          "product_draft",
          "product_broken",
        ],
        "inventory value sort should surface the most valuable stock",
      );
    },
  ],
  [
    "inventory planning estimates reorder urgency from recent paid sales",
    () => {
      const products = [
        {
          id: "product_fast",
          storeId: "store_1",
          name: "Fast Seller",
          slug: "fast-seller",
          sku: "FAST-1",
          category: "Gear",
          description: "A fast selling product with very steady replenishment needs.",
          priceCents: 5000,
          currency: "USD",
          inventoryCount: 5,
          imageUrl: "https://example.com/fast.jpg",
          status: "active",
          createdAt: "2026-05-01T10:00:00.000Z",
          variants: [],
        },
        {
          id: "product_slow",
          storeId: "store_1",
          name: "Slow Seller",
          slug: "slow-seller",
          sku: "SLOW-1",
          category: "Gear",
          description: "A slower moving product with enough stock for now.",
          priceCents: 3000,
          currency: "USD",
          inventoryCount: 80,
          imageUrl: "https://example.com/slow.jpg",
          status: "active",
          createdAt: "2026-05-01T10:00:00.000Z",
          variants: [],
        },
        {
          id: "product_zero",
          storeId: "store_1",
          name: "Zero Stock",
          slug: "zero-stock",
          sku: "ZERO-1",
          category: "Gear",
          description: "A product that has no inventory available to sell.",
          priceCents: 3000,
          currency: "USD",
          inventoryCount: 0,
          imageUrl: "https://example.com/zero.jpg",
          status: "active",
          createdAt: "2026-05-01T10:00:00.000Z",
          variants: [],
        },
      ];
      const orders = [
        {
          id: "order_fast_1",
          customerEmail: "a@example.com",
          status: "paid",
          paidAt: "2026-06-05T10:00:00.000Z",
          createdAt: "2026-06-05T10:00:00.000Z",
          items: [
            {
              productId: "product_fast",
              productName: "Fast Seller",
              unitPriceCents: 5000,
              quantity: 20,
            },
          ],
        },
        {
          id: "order_fast_2",
          customerEmail: "b@example.com",
          status: "fulfilled",
          paidAt: "2026-06-06T10:00:00.000Z",
          createdAt: "2026-06-06T10:00:00.000Z",
          items: [
            {
              productId: "product_fast",
              productName: "Fast Seller",
              unitPriceCents: 5000,
              quantity: 10,
            },
            {
              productId: "product_slow",
              productName: "Slow Seller",
              unitPriceCents: 3000,
              quantity: 3,
            },
          ],
        },
        {
          id: "order_cancelled",
          customerEmail: "c@example.com",
          status: "cancelled",
          paidAt: "2026-06-06T10:00:00.000Z",
          createdAt: "2026-06-06T10:00:00.000Z",
          items: [
            {
              productId: "product_fast",
              productName: "Fast Seller",
              unitPriceCents: 5000,
              quantity: 99,
            },
          ],
        },
      ];
      const signals = inventoryPlanning.getInventoryPlanningSignals({
        products,
        orders,
        now: new Date("2026-06-07T10:00:00.000Z"),
        salesWindowDays: 30,
        reorderPointDays: 14,
        watchPointDays: 30,
        coverDays: 45,
        limit: 10,
      });
      const fast = signals.find((signal) => signal.productId === "product_fast");
      const slow = signals.find((signal) => signal.productId === "product_slow");
      const zero = signals.find((signal) => signal.productId === "product_zero");

      assertEqual(
        signals[0].productId,
        "product_zero",
        "out-of-stock items should sort ahead of reorder warnings",
      );
      assertEqual(zero.urgency, "out_of_stock", "zero inventory should be a stockout");
      assertEqual(fast.soldQuantity, 30, "planner should count recent revenue sales");
      assertEqual(fast.salesVelocityPerDay, 1, "velocity should be rounded to one decimal");
      assertEqual(
        fast.estimatedDaysUntilStockout,
        5,
        "planner should estimate days until stockout from sellable inventory",
      );
      assertEqual(fast.urgency, "reorder_now", "fast-moving low runway items should reorder now");
      assertEqual(fast.reorderQuantity, 40, "reorder quantity should target cover days");
      assertEqual(slow.urgency, "healthy", "slow products with stock should stay healthy");
    },
  ],
  [
    "inventory workspace filters stats and priority sorting",
    () => {
      const makeProduct = (overrides = {}) => ({
        id: "product_reorder",
        storeId: "store_1",
        name: "Field Carry Pack",
        slug: "field-carry-pack",
        sku: "PACK-1",
        category: "Packs",
        description: "A durable carry pack for replenishment planning.",
        priceCents: 9000,
        currency: "USD",
        inventoryCount: 4,
        imageUrl: "https://example.com/pack.jpg",
        status: "active",
        createdAt: "2026-05-01T10:00:00.000Z",
        variants: [],
        ...overrides,
      });
      const productsById = new Map([
        ["product_reorder", makeProduct()],
        [
          "product_zero",
          makeProduct({
            id: "product_zero",
            name: "Out Stock Kit",
            slug: "out-stock-kit",
            sku: "OUT-1",
            inventoryCount: 0,
          }),
        ],
        [
          "product_watch",
          makeProduct({
            id: "product_watch",
            name: "Hydra Bottle",
            slug: "hydra-bottle",
            sku: "HYDRA-1",
            category: "Hydration",
            inventoryCount: 12,
          }),
        ],
        [
          "product_healthy",
          makeProduct({
            id: "product_healthy",
            name: "Trail Watch",
            slug: "trail-watch",
            sku: "WATCH-1",
            category: "Accessories",
            inventoryCount: 40,
          }),
        ],
      ]);
      const signals = [
        {
          productId: "product_reorder",
          productName: "Field Carry Pack",
          urgency: "reorder_now",
          label: "Reorder now",
          soldQuantity: 30,
          salesVelocityPerDay: 1,
          sellableInventoryCount: 4,
          estimatedDaysUntilStockout: 4,
          reorderQuantity: 41,
          detail: "Estimated stockout in 4 days; reorder about 41 units.",
        },
        {
          productId: "product_zero",
          productName: "Out Stock Kit",
          urgency: "out_of_stock",
          label: "Out of stock",
          soldQuantity: 5,
          salesVelocityPerDay: 0.2,
          sellableInventoryCount: 0,
          reorderQuantity: 9,
          detail: "Out Stock Kit has no sellable inventory available.",
        },
        {
          productId: "product_watch",
          productName: "Hydra Bottle",
          urgency: "watch",
          label: "Watch stock",
          soldQuantity: 12,
          salesVelocityPerDay: 0.4,
          sellableInventoryCount: 12,
          estimatedDaysUntilStockout: 30,
          reorderQuantity: 6,
          detail: "Estimated stockout in 30 days; watch replenishment timing.",
        },
        {
          productId: "product_healthy",
          productName: "Trail Watch",
          urgency: "healthy",
          label: "Healthy",
          soldQuantity: 2,
          salesVelocityPerDay: 0.1,
          sellableInventoryCount: 40,
          estimatedDaysUntilStockout: 400,
          reorderQuantity: 0,
          detail: "40 sellable units cover about 400 days.",
        },
      ];

      const stats = inventoryPlanning.getInventoryPlanningStats(signals);

      assertEqual(stats.actionRequired, 2, "inventory stats should count urgent work");
      assertEqual(stats.reorderNow, 1, "inventory stats should count reorder rows");
      assertEqual(
        stats.totalReorderQuantity,
        56,
        "inventory stats should sum recommended reorder units",
      );
      assertEqual(
        inventoryPlanning.parseInventoryPlanningUrgencyFilter("soon"),
        "all",
        "invalid inventory workspace filters should fall back to all",
      );
      assertEqual(
        inventoryPlanning.parseInventoryPlanningSortOption("unknown"),
        "urgency",
        "invalid inventory workspace sort should fall back to urgency",
      );
      assertDeepEqual(
        inventoryPlanning
          .filterInventoryPlanningSignals({
            signals,
            query: "hydration",
            urgency: "all",
            sort: "urgency",
            productsById,
          })
          .map((signal) => signal.productId),
        ["product_watch"],
        "inventory search should include SKU and category metadata",
      );
      assertDeepEqual(
        inventoryPlanning
          .filterInventoryPlanningSignals({
            signals,
            query: "",
            urgency: "action_required",
            sort: "runway_asc",
            productsById,
          })
          .map((signal) => signal.productId),
        ["product_zero", "product_reorder"],
        "action required runway sort should put stockouts first",
      );
      assertDeepEqual(
        inventoryPlanning
          .filterInventoryPlanningSignals({
            signals,
            query: "",
            urgency: "all",
            sort: "reorder_desc",
            productsById,
          })
          .map((signal) => signal.productId),
        [
          "product_reorder",
          "product_zero",
          "product_watch",
          "product_healthy",
        ],
        "largest reorder sort should prioritize the biggest replenishment need",
      );
    },
  ],
  [
    "gift cards normalize codes and cap redemptions by balance and order total",
    () => {
      assertEqual(
        giftCards.normalizeGiftCardCode(" summer 5000 "),
        "SUMMER-5000",
        "gift card codes should normalize to uppercase dashed format",
      );
      assertEqual(
        giftCards.maskGiftCardCode("SUMMER-5000"),
        "**** 5000",
        "gift card masks should reveal only the last four characters",
      );
      assertTrue(
        giftCards.canRedeemGiftCard({
          status: "active",
          balanceCents: 5000,
        }),
        "active cards with balance should be redeemable",
      );
      assertFalse(
        giftCards.canRedeemGiftCard(
          {
            status: "active",
            balanceCents: 5000,
            expiresAt: "2026-01-01T00:00:00.000Z",
          },
          new Date("2026-06-07T00:00:00.000Z"),
        ),
        "expired gift cards should not be redeemable",
      );
      assertEqual(
        giftCards.calculateGiftCardRedemptionAmount({
          balanceCents: 3000,
          orderTotalCents: 5000,
        }),
        3000,
        "gift card redemption should not exceed balance",
      );
      assertEqual(
        giftCards.calculateGiftCardRedemptionAmount({
          balanceCents: 7000,
          orderTotalCents: 5000,
        }),
        5000,
        "gift card redemption should not exceed order total",
      );
      assertEqual(
        giftCards.calculateGiftCardRefundAmount({
          alreadyRefundedGiftCardCents: 1000,
          giftCardTenderCents: 2500,
          refundAmountCents: 2000,
        }),
        1500,
        "gift card refunds should only re-credit remaining gift card tender",
      );
      assertEqual(
        giftCards.calculateGiftCardRefundAmount({
          alreadyRefundedGiftCardCents: 2500,
          giftCardTenderCents: 2500,
          refundAmountCents: 2000,
        }),
        0,
        "gift card refunds should not double re-credit tender",
      );
    },
  ],
  [
    "fulfillments sort active shipments and enforce terminal states",
    () => {
      const shipmentRows = [
        {
          id: "old",
          status: "in_transit",
          createdAt: "2026-06-01T10:00:00.000Z",
          shippedAt: "2026-06-02T10:00:00.000Z",
        },
        {
          id: "cancelled",
          status: "cancelled",
          createdAt: "2026-06-03T10:00:00.000Z",
        },
        {
          id: "new",
          status: "created",
          createdAt: "2026-06-04T10:00:00.000Z",
        },
      ];

      assertEqual(
        fulfillments.getLatestFulfillment(shipmentRows).id,
        "new",
        "latest fulfillment should ignore cancelled shipments",
      );
      assertTrue(
        fulfillments.canTransitionFulfillmentStatus("created", "in_transit"),
        "created shipments should move to in transit",
      );
      assertTrue(
        fulfillments.canTransitionFulfillmentStatus("in_transit", "delivered"),
        "in transit shipments should move to delivered",
      );
      assertFalse(
        fulfillments.canTransitionFulfillmentStatus("delivered", "in_transit"),
        "delivered shipments should be terminal",
      );
      assertFalse(
        fulfillments.canTransitionFulfillmentStatus("cancelled", "created"),
        "cancelled shipments should be terminal",
      );
    },
  ],
  [
    "order insights summarize fulfillment and risk for merchant triage",
    () => {
      const makeOrder = (overrides = {}) => ({
        id: "order_current",
        storeId: "store_1",
        customerName: "Nina Shah",
        customerEmail: "nina@example.com",
        status: "paid",
        source: "storefront",
        paymentStatus: "paid",
        paymentMethod: "card",
        paymentProvider: "Stripe",
        subtotalCents: 10000,
        discountCents: 0,
        giftCardCents: 0,
        shippingCents: 0,
        taxCents: 0,
        taxRateBps: 0,
        totalCents: 10000,
        amountDueCents: 0,
        refundedCents: 0,
        refundableCents: 10000,
        currency: "USD",
        createdAt: "2026-06-06T10:00:00.000Z",
        shippingAddress: {
          line1: "1 Main Street",
          city: "Austin",
          region: "TX",
          postalCode: "78701",
          country: "US",
        },
        items: [],
        fulfillments: [],
        refunds: [],
        returnRequests: [],
        paymentTransactions: [
          {
            id: "txn_capture",
            storeId: "store_1",
            orderId: "order_current",
            type: "capture",
            status: "succeeded",
            paymentMethod: "card",
            paymentProvider: "Stripe",
            amountCents: 10000,
            currency: "USD",
            metadata: {},
            createdAt: "2026-06-06T10:02:00.000Z",
          },
        ],
        ...overrides,
      });
      const readyOrder = makeOrder();
      const readySummary = orderInsights.getOrderFulfillmentSummary(readyOrder);

      assertEqual(
        readySummary.stage,
        "unfulfilled",
        "paid orders without shipments should be ready for fulfillment",
      );
      assertEqual(
        readySummary.detail,
        "Paid order is ready for fulfillment.",
        "paid fulfillment detail should guide the operator",
      );

      const shippedSummary = orderInsights.getOrderFulfillmentSummary(
        makeOrder({
          fulfillments: [
            {
              id: "fulfillment_1",
              storeId: "store_1",
              orderId: "order_current",
              status: "in_transit",
              trackingNumber: "1Z999",
              createdAt: "2026-06-06T11:00:00.000Z",
              updatedAt: "2026-06-06T11:00:00.000Z",
            },
          ],
        }),
      );

      assertEqual(
        shippedSummary.stage,
        "in_transit",
        "active in-transit shipments should drive fulfillment summary",
      );
      assertTrue(
        shippedSummary.hasTracking,
        "fulfillment summary should surface tracking presence",
      );

      const riskyOrder = makeOrder({
        id: "order_risky",
        customerEmail: "risk@example.com",
        status: "pending",
        paymentStatus: "pending",
        paymentMethod: "cash_on_delivery",
        totalCents: 125000,
        amountDueCents: 125000,
        refundableCents: 125000,
        createdAt: "2026-06-01T10:00:00.000Z",
        shippingAddress: undefined,
        paymentTransactions: [],
      });
      const riskyAssessment = orderInsights.getOrderRiskAssessment(riskyOrder, {
        now: new Date("2026-06-07T10:00:00.000Z"),
        orders: [
          makeOrder({
            id: "order_cancelled_1",
            customerEmail: "risk@example.com",
            status: "cancelled",
          }),
          makeOrder({
            id: "order_cancelled_2",
            customerEmail: "risk@example.com",
            status: "cancelled",
          }),
        ],
      });
      const riskFactorIds = riskyAssessment.factors.map((factor) => factor.id);

      assertEqual(
        riskyAssessment.level,
        "high",
        "open high-value stale COD orders should be high risk",
      );
      assertDeepEqual(
        riskFactorIds,
        [
          "payment_open",
          "stale_pending_payment",
          "high_value_order",
          "cash_on_delivery_review",
          "missing_shipping_address",
          "repeat_cancelled_customer_orders",
        ],
        "risk assessment should explain each merchant review flag",
      );
    },
  ],
  [
    "order filters triage payment, fulfillment, source, and risk",
    () => {
      const makeOrder = (overrides = {}) => ({
        id: "order_paid_ready",
        storeId: "store_1",
        customerName: "Nina Shah",
        customerEmail: "nina@example.com",
        status: "paid",
        source: "storefront",
        internalNote: "",
        paymentStatus: "paid",
        paymentMethod: "card",
        paymentProvider: "Stripe",
        subtotalCents: 10000,
        discountCents: 0,
        giftCardCents: 0,
        shippingCents: 0,
        taxCents: 0,
        taxRateBps: 0,
        totalCents: 10000,
        amountDueCents: 0,
        refundedCents: 0,
        refundableCents: 10000,
        currency: "USD",
        createdAt: "2026-06-06T10:00:00.000Z",
        shippingAddress: {
          line1: "1 Main Street",
          city: "Austin",
          region: "TX",
          postalCode: "78701",
          country: "US",
        },
        items: [
          {
            productId: "product_pack",
            productName: "Field Pack",
            unitPriceCents: 10000,
            quantity: 1,
          },
        ],
        fulfillments: [],
        refunds: [],
        returnRequests: [],
        paymentTransactions: [
          {
            id: "txn_capture",
            storeId: "store_1",
            orderId: "order_paid_ready",
            type: "capture",
            status: "succeeded",
            paymentMethod: "card",
            paymentProvider: "Stripe",
            amountCents: 10000,
            currency: "USD",
            metadata: {},
            createdAt: "2026-06-06T10:02:00.000Z",
          },
        ],
        ...overrides,
      });
      const orderRows = [
        makeOrder(),
        makeOrder({
          id: "order_pending_high",
          customerName: "COD Buyer",
          customerEmail: "cod@example.com",
          status: "pending",
          paymentStatus: "pending",
          paymentMethod: "cash_on_delivery",
          totalCents: 125000,
          amountDueCents: 125000,
          refundableCents: 125000,
          paymentTransactions: [],
        }),
        makeOrder({
          id: "order_manual_ship",
          customerName: "Manual Buyer",
          customerEmail: "manual@example.com",
          source: "manual",
          internalNote: "packing slip requested",
          fulfillments: [
            {
              id: "fulfillment_1",
              storeId: "store_1",
              orderId: "order_manual_ship",
              status: "in_transit",
              trackingCarrier: "UPS",
              trackingNumber: "1Z999",
              createdAt: "2026-06-06T11:00:00.000Z",
              updatedAt: "2026-06-06T11:00:00.000Z",
            },
          ],
        }),
      ];

      assertEqual(
        orderHelpers.parseOrderPaymentStatusFilter("broken"),
        "all",
        "invalid payment filters should fall back to all",
      );
      assertDeepEqual(
        orderHelpers
          .filterOrders({
            orders: orderRows,
            query: "",
            status: "all",
            paymentStatus: "pending",
          })
          .map((order) => order.id),
        ["order_pending_high"],
        "payment filters should isolate pending payment orders",
      );
      assertDeepEqual(
        orderHelpers
          .filterOrders({
            orders: orderRows,
            query: "",
            status: "all",
            fulfillmentStage: "in_transit",
          })
          .map((order) => order.id),
        ["order_manual_ship"],
        "fulfillment filters should isolate in-transit shipments",
      );
      assertDeepEqual(
        orderHelpers
          .filterOrders({
            orders: orderRows,
            query: "",
            status: "all",
            source: "manual",
          })
          .map((order) => order.id),
        ["order_manual_ship"],
        "source filters should isolate manual orders",
      );
      assertDeepEqual(
        orderHelpers
          .filterOrders({
            orders: orderRows,
            query: "",
            status: "all",
            risk: "high",
          })
          .map((order) => order.id),
        ["order_pending_high"],
        "risk filters should isolate high-risk orders",
      );
      assertDeepEqual(
        orderHelpers
          .filterOrders({
            orders: orderRows,
            query: "packing slip",
            status: "all",
          })
          .map((order) => order.id),
        ["order_manual_ship"],
        "order search should include internal notes",
      );
      assertEqual(
        orderHelpers.getOrderStats(orderRows).highRiskOrders,
        1,
        "order stats should count high-risk orders",
      );
    },
  ],
  [
    "product reviews summarize approved ratings and prevent duplicate item reviews",
    () => {
      const reviewRows = [
        {
          rating: 5,
          status: "approved",
        },
        {
          rating: 3,
          status: "approved",
        },
        {
          rating: 1,
          status: "pending",
        },
      ];

      assertDeepEqual(
        reviews.getProductReviewSummary(reviewRows),
        {
          reviewCount: 2,
          averageRating: 4,
        },
        "review summary should use approved reviews only",
      );
      assertTrue(
        reviews.canCustomerReviewOrderItem({
          orderStatus: "fulfilled",
          paymentStatus: "paid",
          productId: "p1",
          orderItemId: "item_1",
          orderId: "order_1",
          existingReviews: [],
        }),
        "fulfilled paid items should be reviewable",
      );
      assertFalse(
        reviews.canCustomerReviewOrderItem({
          orderStatus: "pending",
          paymentStatus: "paid",
          productId: "p1",
          orderItemId: "item_1",
          orderId: "order_1",
          existingReviews: [],
        }),
        "pending orders should not be reviewable",
      );
      assertFalse(
        reviews.canCustomerReviewOrderItem({
          orderStatus: "fulfilled",
          paymentStatus: "paid",
          productId: "p1",
          orderItemId: "item_1",
          orderId: "order_1",
          existingReviews: [
            {
              productId: "p1",
              orderId: "order_1",
              orderItemId: "item_1",
            },
          ],
        }),
        "an order item should not accept duplicate reviews",
      );
    },
  ],
  [
    "abandoned checkouts summarize carts and protect recovery eligibility",
    () => {
      const lines = [
        {
          productId: "p1",
          productName: "Field Pack",
          unitPriceCents: 12900,
          quantity: 1,
        },
        {
          productId: "p2",
          productName: "Hydra Bottle",
          unitPriceCents: 4200,
          quantity: 2,
        },
      ];
      const productWithVariants = {
        id: "p1",
        storeId: "store_1",
        name: "Field Pack",
        slug: "field-pack",
        sku: "PACK-1",
        category: "Bags",
        description: "A compact carry pack.",
        priceCents: 12900,
        currency: "USD",
        inventoryCount: 8,
        imageUrl: "https://example.com/pack.jpg",
        status: "active",
        createdAt: "2026-06-01T10:00:00.000Z",
        variants: [
          {
            id: "v1",
            storeId: "store_1",
            productId: "p1",
            optionName: "Color",
            optionValue: "Black",
            sku: "PACK-BLK",
            priceCents: 11900,
            currency: "USD",
            inventoryCount: 3,
            status: "active",
            sortOrder: 1,
            createdAt: "2026-06-01T10:00:00.000Z",
          },
        ],
      };
      const simpleProduct = {
        id: "p2",
        storeId: "store_1",
        name: "Hydra Bottle",
        slug: "hydra-bottle",
        sku: "BOT-1",
        category: "Drinkware",
        description: "Insulated bottle.",
        priceCents: 4200,
        currency: "USD",
        inventoryCount: 12,
        imageUrl: "https://example.com/bottle.jpg",
        status: "active",
        createdAt: "2026-06-01T10:00:00.000Z",
        variants: [],
      };
      const captured = abandonedCheckouts.captureAbandonedCheckoutLines({
        cart: [
          { productId: "p1", variantId: "v1", quantity: 2 },
          { productId: "p1", variantId: "v1", quantity: 2 },
          { productId: "p2", quantity: 2 },
        ],
        products: [productWithVariants, simpleProduct],
      });
      const summary = abandonedCheckouts.summarizeAbandonedCheckoutLines(lines);

      assertDeepEqual(
        summary,
        {
          lineCount: 2,
          itemCount: 3,
          subtotalCents: 21300,
        },
        "abandoned checkout summaries should count lines, items, and subtotal",
      );
      assertDeepEqual(
        captured.lines.map((item) => ({
          productId: item.line.productId,
          productVariantId: item.line.productVariantId,
          variantName: item.line.variantName,
          unitPriceCents: item.line.unitPriceCents,
          quantity: item.line.quantity,
        })),
        [
          {
            productId: "p1",
            productVariantId: "v1",
            variantName: "Color: Black",
            unitPriceCents: 11900,
            quantity: 3,
          },
          {
            productId: "p2",
            productVariantId: undefined,
            variantName: undefined,
            unitPriceCents: 4200,
            quantity: 2,
          },
        ],
        "abandoned checkout capture should merge lines and cap saved quantity to stock",
      );
      assertEqual(
        abandonedCheckouts.captureAbandonedCheckoutLines({
          cart: [{ productId: "p1", quantity: 1 }],
          products: [productWithVariants],
        }).error,
        "Choose an available variant for Field Pack.",
        "abandoned checkout capture should require an active variant when variants exist",
      );
      assertEqual(
        abandonedCheckouts.captureAbandonedCheckoutLines({
          cart: [{ productId: "missing", quantity: 1 }],
          products: [productWithVariants],
        }).error,
        "One or more cart items are unavailable.",
        "abandoned checkout capture should reject unknown products",
      );
      assertEqual(
        abandonedCheckouts.captureAbandonedCheckoutLines({
          cart: [
            {
              productId: "p2",
              quantity: 1,
            },
          ],
          products: [{ ...simpleProduct, inventoryCount: 0 }],
        }).error,
        "Hydra Bottle is out of stock.",
        "abandoned checkout capture should reject out-of-stock products",
      );
      assertEqual(
        abandonedCheckouts.getAbandonedCheckoutRecoveryHref({
          storeSlug: "northline-supply",
          recoveryToken: "tok 123",
        }),
        "/stores/northline-supply/checkout?recovery=tok%20123",
        "recovery href should point at checkout with an encoded token",
      );
      assertTrue(
        abandonedCheckouts.canQueueAbandonedCheckoutRecovery({
          customerEmail: "nina@example.com",
          recoveryToken: "demo-recovery-1004",
          status: "open",
          lines,
        }),
        "open checkouts with customer email and cart lines should be recoverable",
      );
      assertFalse(
        abandonedCheckouts.canQueueAbandonedCheckoutRecovery({
          customerEmail: "nina@example.com",
          recoveryToken: "demo-recovery-1004",
          status: "recovered",
          lines,
        }),
        "recovered checkouts should not queue recovery again",
      );

      const checkoutRows = [
        {
          id: "checkout_open",
          storeId: "store_1",
          customerEmail: "nina@example.com",
          customerName: "Nina Brooks",
          recoveryToken: "recover-open",
          status: "open",
          lines,
          subtotalCents: 22300,
          currency: "USD",
          lastSeenAt: "2026-06-06T15:35:00.000Z",
          recoveryEmailCount: 1,
          createdAt: "2026-06-06T15:20:00.000Z",
          updatedAt: "2026-06-06T16:00:00.000Z",
        },
        {
          id: "checkout_recovered",
          storeId: "store_1",
          customerEmail: "leo@example.com",
          customerName: "Leo Martin",
          recoveryToken: "recover-done",
          status: "recovered",
          lines: lines.slice(0, 1),
          subtotalCents: 12900,
          currency: "USD",
          lastSeenAt: "2026-06-04T15:35:00.000Z",
          recoveryEmailCount: 2,
          recoveredOrderId: "order_1",
          recoveredAt: "2026-06-04T18:00:00.000Z",
          createdAt: "2026-06-04T15:20:00.000Z",
          updatedAt: "2026-06-04T18:00:00.000Z",
        },
        {
          id: "checkout_dismissed",
          storeId: "store_1",
          customerEmail: "ari@example.com",
          customerName: "Ari Patel",
          recoveryToken: "recover-dismissed",
          status: "dismissed",
          lines: lines.slice(1),
          subtotalCents: 8400,
          currency: "USD",
          lastSeenAt: "2026-06-05T15:35:00.000Z",
          recoveryEmailCount: 0,
          dismissedAt: "2026-06-05T16:00:00.000Z",
          createdAt: "2026-06-05T15:20:00.000Z",
          updatedAt: "2026-06-05T16:00:00.000Z",
        },
      ];

      assertDeepEqual(
        abandonedCheckouts.getAbandonedCheckoutStats(checkoutRows),
        {
          total: 3,
          open: 1,
          recoverable: 1,
          recovered: 1,
          dismissed: 1,
          recoverableValueCents: 22300,
          recoveredValueCents: 12900,
        },
        "abandoned checkout stats should summarize recovery work",
      );
      assertDeepEqual(
        abandonedCheckouts
          .filterAbandonedCheckouts({
            checkouts: checkoutRows,
            query: "bottle",
            status: "all",
            sort: "recovery_priority",
          })
          .map((checkout) => checkout.id),
        ["checkout_open", "checkout_dismissed"],
        "abandoned checkout filtering should search cart line details",
      );
      assertDeepEqual(
        abandonedCheckouts
          .filterAbandonedCheckouts({
            checkouts: checkoutRows,
            query: "",
            status: "open",
            sort: "value_desc",
          })
          .map((checkout) => checkout.id),
        ["checkout_open"],
        "abandoned checkout filtering should apply status filters",
      );
      assertEqual(
        abandonedCheckouts.parseAbandonedCheckoutStatusFilter("missing"),
        "all",
        "invalid abandoned checkout status filters should fall back to all",
      );
      assertEqual(
        abandonedCheckouts.parseAbandonedCheckoutSortOption("missing"),
        "recovery_priority",
        "invalid abandoned checkout sort options should fall back to priority",
      );
    },
  ],
  [
    "store SEO falls back cleanly and prefers merchant settings",
    () => {
      const store = {
        name: "Northline Supply",
        slug: "northline-supply",
        currency: "USD",
        description: "Premium everyday goods.",
        seoTitle: "Northline Supply | Durable gear",
        seoDescription: "Shop durable everyday gear from Northline Supply.",
        socialImageUrl: "https://example.com/social.jpg",
      };
      const product = {
        id: "product_pack",
        storeId: "store_1",
        name: "Field Carry Pack",
        slug: "field-carry-pack",
        sku: "PACK-001",
        category: "Everyday Carry",
        description: "Weather-resistant carry pack.",
        priceCents: 12900,
        currency: "USD",
        inventoryCount: 0,
        imageUrl: "https://example.com/pack.jpg",
        status: "active",
        createdAt: "2026-06-01T10:00:00.000Z",
        variants: [
          {
            id: "variant_pack_black",
            storeId: "store_1",
            productId: "product_pack",
            optionName: "Color",
            optionValue: "Black",
            sku: "PACK-001-BLK",
            priceCents: 11900,
            currency: "USD",
            inventoryCount: 8,
            status: "active",
            sortOrder: 1,
            createdAt: "2026-06-01T10:00:00.000Z",
          },
        ],
      };
      const collection = {
        title: "Everyday Carry",
        slug: "everyday-carry",
        description: "Bags, bottles, and compact gear.",
      };
      const baseUrl = runtimeEnv.getAppUrl().replace(/\/$/, "");

      assertEqual(
        seo.getStoreSeoTitle(store),
        "Northline Supply | Durable gear",
        "storefront metadata should prefer merchant SEO title",
      );
      assertEqual(
        seo.getStoreSeoTitle(store, "Checkout"),
        "Checkout | Northline Supply | Durable gear",
        "nested metadata should append merchant SEO title",
      );
      assertEqual(
        seo.getStoreSeoDescription(store),
        "Shop durable everyday gear from Northline Supply.",
        "metadata should prefer merchant SEO description",
      );
      assertDeepEqual(
        seo.getStoreSocialImages(store, "https://example.com/fallback.jpg"),
        ["https://example.com/social.jpg", "https://example.com/fallback.jpg"],
        "social images should include merchant image before fallback",
      );
      assertDeepEqual(
        seo.getStoreSocialImages(store, "https://example.com/social.jpg"),
        ["https://example.com/social.jpg"],
        "social images should not duplicate identical URLs",
      );
      assertEqual(
        seo.getStoreCanonicalUrl(store),
        `${baseUrl}/stores/northline-supply`,
        "store canonical URL should use the public app URL",
      );
      assertEqual(
        seo.getProductCanonicalUrl(store, product),
        `${baseUrl}/stores/northline-supply/products/field-carry-pack`,
        "product canonical URL should include the product slug",
      );
      assertEqual(
        seo.getCollectionCanonicalUrl(store, collection),
        `${baseUrl}/stores/northline-supply/collections/everyday-carry`,
        "collection canonical URL should include the collection slug",
      );
      assertFalse(
        seo.serializeJsonLd({ name: "<script>" }).includes("<script>"),
        "JSON-LD serialization should escape script-like content",
      );
      const storeJsonLd = seo.getStoreJsonLd({ store, products: [product] });
      const productJsonLd = seo.getProductJsonLd({
        store,
        product,
        reviewSummary: { averageRating: 4.5, reviewCount: 12 },
      });
      const collectionJsonLd = seo.getCollectionJsonLd({
        store,
        collection,
        products: [product],
      });

      assertEqual(
        storeJsonLd["@type"],
        "Store",
        "store JSON-LD should identify the storefront",
      );
      assertEqual(
        storeJsonLd.makesOffer[0].price,
        "119.00",
        "store JSON-LD offers should use the lowest active variant price",
      );
      assertEqual(
        productJsonLd.offers.availability,
        "https://schema.org/InStock",
        "product JSON-LD should expose sellable variant inventory",
      );
      assertEqual(
        productJsonLd.aggregateRating.reviewCount,
        12,
        "product JSON-LD should include approved review totals",
      );
      assertEqual(
        collectionJsonLd.mainEntity.itemListElement[0].url,
        `${baseUrl}/stores/northline-supply/products/field-carry-pack`,
        "collection JSON-LD should link listed products",
      );
      assertEqual(
        seo.getStoreSeoDescription({ name: "Draft", description: "" }),
        "Draft storefront.",
        "metadata should fall back when no description exists",
      );
    },
  ],
  [
    "return requests require paid orders inside the return window",
    () => {
      const now = new Date("2026-06-01T12:00:00.000Z");
      const baseOrder = {
        status: "fulfilled",
        paymentStatus: "paid",
        refundableCents: 5000,
        createdAt: "2026-05-01T12:00:00.000Z",
        paidAt: "2026-05-02T12:00:00.000Z",
        fulfilledAt: "2026-05-15T12:00:00.000Z",
        fulfillments: [],
        returnRequests: [],
      };

      assertTrue(
        returns.canCustomerRequestReturn(baseOrder, now),
        "fulfilled paid orders should accept return requests",
      );
      assertEqual(
        returns.getReturnRequestDeadline(baseOrder),
        "2026-06-14T12:00:00.000Z",
        "return windows should start from fulfillment when available",
      );
      assertEqual(
        returns.getCustomerReturnRequestEligibility(baseOrder, now).message,
        "Returns are available within 30 days while no active return request is open.",
        "eligible returns should describe the 30-day active-request rule",
      );
      assertFalse(
        returns.canCustomerRequestReturn(
          {
            ...baseOrder,
            status: "pending",
          },
          now,
        ),
        "pending orders should not accept return requests",
      );
      assertFalse(
        returns.canCustomerRequestReturn(
          {
            ...baseOrder,
            paymentStatus: "authorized",
          },
          now,
        ),
        "authorized but uncaptured orders should not accept return requests",
      );
      assertFalse(
        returns.canCustomerRequestReturn(
          {
            ...baseOrder,
            refundableCents: 0,
          },
          now,
        ),
        "fully refunded orders should not accept return requests",
      );
      assertFalse(
        returns.canCustomerRequestReturn(
          {
            ...baseOrder,
            returnRequests: [{ status: "requested" }],
          },
          now,
        ),
        "orders with active return requests should not accept duplicates",
      );
      assertFalse(
        returns.canCustomerRequestReturn(
          {
            ...baseOrder,
            fulfilledAt: "2026-04-01T12:00:00.000Z",
          },
          now,
        ),
        "orders outside the return window should not accept requests",
      );
      assertTrue(
        returns.canCustomerRequestReturn(
          {
            ...baseOrder,
            returnRequests: [{ status: "resolved" }],
          },
          now,
        ),
        "resolved return requests should not block a new eligible request",
      );
    },
  ],
  [
    "return request status transitions keep terminal states closed",
    () => {
      assertTrue(
        returns.canTransitionReturnRequestStatus("requested", "approved"),
        "requested returns should be approvable",
      );
      assertTrue(
        returns.canTransitionReturnRequestStatus("requested", "rejected"),
        "requested returns should be rejectable",
      );
      assertFalse(
        returns.canTransitionReturnRequestStatus("requested", "resolved"),
        "requested returns should require approval before resolution",
      );
      assertTrue(
        returns.canTransitionReturnRequestStatus("approved", "resolved"),
        "approved returns should be resolvable",
      );
      assertFalse(
        returns.canTransitionReturnRequestStatus("resolved", "approved"),
        "resolved returns should not reopen",
      );
      assertDeepEqual(
        returns.getReturnRequestStatusOptions("rejected"),
        ["rejected"],
        "rejected returns should only allow note-only saves",
      );
    },
  ],
  [
    "return request queue prioritizes active merchant work",
    () => {
      const makeOrder = (overrides = {}) => ({
        id: "order_return_1",
        storeId: "store_1",
        customerName: "Mira Chen",
        customerEmail: "mira@example.com",
        status: "fulfilled",
        paymentStatus: "paid",
        refundableCents: 12000,
        currency: "USD",
        createdAt: "2026-05-01T10:00:00.000Z",
        paidAt: "2026-05-01T10:00:00.000Z",
        fulfilledAt: "2026-05-05T10:00:00.000Z",
        fulfillments: [],
        returnRequests: [],
        ...overrides,
      });
      const orders = [
        makeOrder({
          id: "order_approved",
          customerName: "Ari Patel",
          customerEmail: "ari@example.com",
          returnRequests: [
            {
              id: "return_approved",
              storeId: "store_1",
              orderId: "order_approved",
              customerEmail: "ari@example.com",
              status: "approved",
              reason: "changed_mind",
              note: "Duplicate gift and still unopened.",
              merchantNote: "Refund after inspection.",
              requestedAt: "2026-06-01T09:00:00.000Z",
              createdAt: "2026-06-01T09:00:00.000Z",
              updatedAt: "2026-06-01T09:00:00.000Z",
            },
          ],
        }),
        makeOrder({
          id: "order_requested",
          returnRequests: [
            {
              id: "return_requested",
              storeId: "store_1",
              orderId: "order_requested",
              customerEmail: "mira@example.com",
              status: "requested",
              reason: "damaged",
              note: "Arrived with visible damage on the corner.",
              requestedAt: "2026-05-30T09:00:00.000Z",
              createdAt: "2026-05-30T09:00:00.000Z",
              updatedAt: "2026-05-30T09:00:00.000Z",
            },
            {
              id: "return_resolved",
              storeId: "store_1",
              orderId: "order_requested",
              customerEmail: "mira@example.com",
              status: "resolved",
              reason: "quality",
              note: "Old resolved return.",
              requestedAt: "2026-05-20T09:00:00.000Z",
              createdAt: "2026-05-20T09:00:00.000Z",
              updatedAt: "2026-05-21T09:00:00.000Z",
            },
          ],
        }),
      ];
      const queue = returns.getReturnRequestQueue(orders, {
        storeId: "store_1",
        now: new Date("2026-06-07T09:00:00.000Z"),
      });
      const stats = returns.getReturnRequestQueueStats(queue);

      assertDeepEqual(
        queue.map((item) => item.request.id),
        ["return_requested", "return_approved"],
        "active return queue should sort requested before approved and hide closed requests",
      );
      assertEqual(queue[0].priority, "needs_review", "requested returns should need review");
      assertEqual(queue[0].requestedAgeDays, 8, "return queue should expose request age");
      assertEqual(
        queue[1].detail,
        "Approved return has 120.00 USD still refundable.",
        "approved returns should explain refundable balance",
      );
      assertEqual(stats.totalOpen, 2, "queue stats should count active return work");
      assertEqual(stats.needsReview, 1, "queue stats should count requested returns");
      assertEqual(
        stats.awaitingResolution,
        1,
        "queue stats should count approved returns awaiting resolution",
      );
    },
  ],
  [
    "customer order receipt tokens are unique and present",
    () => {
      const tokens = mockData.mockOrders.map((order) => order.customerAccessToken);

      assertTrue(
        tokens.every((token) => typeof token === "string" && token.length >= 12),
        "every mock order should include a customer receipt token",
      );
      assertEqual(
        new Set(tokens).size,
        tokens.length,
        "customer receipt tokens should be unique",
      );
    },
  ],
  [
    "mock product reviews have unique reviewed order items",
    () => {
      const orderItemIds = mockData.mockProductReviews
        .map((review) => review.orderItemId)
        .filter(Boolean);

      assertEqual(
        new Set(orderItemIds).size,
        orderItemIds.length,
        "mock product reviews should not duplicate order item ids",
      );
      assertTrue(
        mockData.mockProductReviews.every(
          (review) => review.rating >= 1 && review.rating <= 5,
        ),
        "mock product reviews should use 1-5 star ratings",
      );
    },
  ],
  [
    "abandoned checkout recovery tokens are unique and present",
    () => {
      const tokens = mockData.mockAbandonedCheckouts.map(
        (checkout) => checkout.recoveryToken,
      );

      assertTrue(
        tokens.every((token) => typeof token === "string" && token.length >= 12),
        "every mock abandoned checkout should include a recovery token",
      );
      assertEqual(
        new Set(tokens).size,
        tokens.length,
        "abandoned checkout recovery tokens should be unique",
      );
    },
  ],
  [
    "payment ledger summarizes successful captures and refunds",
    () => {
      const summary = payments.summarizePaymentTransactions([
        {
          type: "authorization",
          status: "succeeded",
          amountCents: 10000,
        },
        {
          type: "capture",
          status: "succeeded",
          amountCents: 10000,
        },
        {
          type: "refund",
          status: "succeeded",
          amountCents: 2500,
        },
        {
          type: "refund",
          status: "failed",
          amountCents: 500,
        },
      ]);

      assertEqual(summary.authorizedCents, 10000, "authorized amount should sum");
      assertEqual(summary.capturedCents, 10000, "captures should sum");
      assertEqual(summary.refundedCents, 2500, "failed refunds should be ignored");
      assertEqual(summary.netCapturedCents, 7500, "net captured should subtract refunds");
      assertEqual(
        payments.getPaymentCaptureAmountCents({
          totalCents: 10000,
          giftCardCents: 3000,
          amountDueCents: 7000,
        }),
        7000,
        "captures should use remaining amount due after gift cards",
      );
      assertEqual(
        payments.getPaymentCaptureAmountCents({
          totalCents: 10000,
          giftCardCents: 10000,
          amountDueCents: 0,
        }),
        0,
        "fully gift-card-paid orders should not create extra captures",
      );
      assertEqual(
        payments.getPaymentCaptureAmountCents({
          totalCents: 10000,
          giftCardCents: 2500,
        }),
        7500,
        "legacy rows should fall back to total minus gift card tender",
      );
      assertEqual(
        payments.getPaymentCaptureAmountCents({
          totalCents: 10000,
          amountDueCents: 12000,
        }),
        10000,
        "captures should never exceed the order total",
      );
      assertEqual(
        payments.getOrderAmountDueCents({
          totalCents: 10000,
          amountDueCents: 7000,
          paymentStatus: "paid",
        }),
        0,
        "paid orders should not show a remaining amount due",
      );
      assertEqual(
        payments.getOrderAmountDueCents({
          totalCents: 10000,
          amountDueCents: 7000,
          paymentStatus: "pending",
        }),
        7000,
        "pending orders should show the remaining amount due",
      );

      const makeOrder = (overrides = {}) => ({
        status: "paid",
        paymentStatus: "paid",
        totalCents: 10000,
        amountDueCents: 0,
        giftCardCents: 3000,
        refundedCents: 2000,
        refundableCents: 8000,
        refunds: [
          {
            amountCents: 2000,
            giftCardCents: 1000,
            paymentCents: 1000,
          },
        ],
        paymentTransactions: [
          {
            type: "capture",
            status: "succeeded",
            amountCents: 7000,
          },
          {
            type: "refund",
            status: "succeeded",
            amountCents: 1000,
          },
        ],
        ...overrides,
      });
      const settled = payments.getOrderFinancialReconciliation(makeOrder());
      const openBalance = payments.getOrderFinancialReconciliation(
        makeOrder({
          paymentStatus: "pending",
          amountDueCents: 7000,
          giftCardCents: 3000,
          refundedCents: 0,
          refundableCents: 10000,
          refunds: [],
          paymentTransactions: [],
        }),
      );
      const ledgerMismatch = payments.getOrderFinancialReconciliation(
        makeOrder({
          giftCardCents: 0,
          refundedCents: 0,
          refundableCents: 10000,
          refunds: [],
          paymentTransactions: [
            {
              type: "capture",
              status: "succeeded",
              amountCents: 5000,
            },
          ],
        }),
      );
      const overRefunded = payments.getOrderFinancialReconciliation(
        makeOrder({
          refundedCents: 12000,
          refundableCents: 0,
          refunds: [
            {
              amountCents: 12000,
              giftCardCents: 3000,
              paymentCents: 9000,
            },
          ],
        }),
      );

      assertEqual(settled.status, "settled", "balanced orders should settle");
      assertEqual(settled.netCollectedCents, 8000, "net collected should include tender refunds");
      assertEqual(settled.expectedNetCents, 8000, "expected net should subtract total refunds");
      assertEqual(openBalance.status, "open_balance", "pending payments should expose open balance");
      assertEqual(openBalance.balanceDueCents, 7000, "open balance should use amount due");
      assertEqual(
        ledgerMismatch.status,
        "ledger_mismatch",
        "paid orders with low captured tender should flag ledger mismatch",
      );
      assertEqual(
        ledgerMismatch.ledgerDeltaCents,
        -5000,
        "ledger mismatch should expose the collected-vs-expected delta",
      );
      assertEqual(
        overRefunded.status,
        "over_refunded",
        "refunds above the original total should be critical",
      );
    },
  ],
  [
    "store policies expose only published storefront pages",
    () => {
      const storePolicies = [
        {
          id: "policy_1",
          storeId: "store_1",
          type: "refund",
          title: "Refund policy",
          body: "Returns are available for unused items.",
          status: "published",
        },
        {
          id: "policy_2",
          storeId: "store_1",
          type: "terms",
          title: "Terms",
          body: "",
          status: "published",
        },
        {
          id: "policy_3",
          storeId: "store_1",
          type: "privacy",
          title: "Privacy",
          body: "Draft body",
          status: "draft",
        },
      ];

      assertDeepEqual(
        policies.getPublishedPolicies(storePolicies).map((policy) => policy.id),
        ["policy_1"],
        "only published policies with body content should be public",
      );
      assertEqual(
        policies.getPolicyHref("northline-supply", "refund"),
        "/stores/northline-supply/policies/refund",
        "policy href should point at storefront policy route",
      );
    },
  ],
  [
    "store custom pages expose only published content",
    () => {
      const pages = [
        {
          id: "page_1",
          title: "About",
          slug: "about",
          body: "Northline Supply curates durable goods for everyday travel.",
          status: "published",
        },
        {
          id: "page_2",
          title: "Wholesale",
          slug: "wholesale",
          body: "Draft wholesale copy",
          status: "draft",
        },
        {
          id: "page_3",
          title: "Empty",
          slug: "empty",
          body: "",
          status: "published",
        },
      ];

      assertDeepEqual(
        storePages.getPublishedStorePages(pages).map((page) => page.id),
        ["page_1"],
        "only published custom pages with body content should be public",
      );
      assertEqual(
        storePages.getStorePageHref("northline-supply", "about"),
        "/stores/northline-supply/pages/about",
        "custom page href should point at storefront page route",
      );
      assertEqual(
        storePages.getStorePageDescription(pages[0]),
        "Northline Supply curates durable goods for everyday travel.",
        "custom page description should fall back to body copy",
      );
    },
  ],
  [
    "store analytics summarizes sales, refunds, mix, and products",
    () => {
      const orders = [
        {
          id: "order_1",
          status: "paid",
          source: "storefront",
          customerName: "Ari Patel",
          customerEmail: "a@example.com",
          paymentStatus: "paid",
          totalCents: 10000,
          amountDueCents: 0,
          refundedCents: 2000,
          currency: "USD",
          paidAt: "2026-06-06T10:00:00.000Z",
          createdAt: "2026-06-06T09:00:00.000Z",
          items: [
            {
              productId: "p1",
              productName: "Apex Jacket",
              unitPriceCents: 3000,
              quantity: 2,
            },
            {
              productId: "p2",
              productName: "Trail Hat",
              unitPriceCents: 4000,
              quantity: 1,
            },
          ],
          refunds: [],
          returnRequests: [
            {
              id: "return_1",
              status: "requested",
              reason: "damaged",
              requestedAt: "2026-06-07T09:00:00.000Z",
            },
          ],
        },
        {
          id: "order_2",
          status: "fulfilled",
          source: "manual",
          customerName: "Ari Patel",
          customerEmail: "a@example.com",
          paymentStatus: "paid",
          totalCents: 5000,
          amountDueCents: 0,
          refundedCents: 0,
          currency: "USD",
          paidAt: "2026-06-07T10:00:00.000Z",
          createdAt: "2026-06-07T09:00:00.000Z",
          items: [
            {
              productId: "p1",
              productName: "Apex Jacket",
              unitPriceCents: 5000,
              quantity: 1,
            },
          ],
          refunds: [],
          returnRequests: [],
        },
        {
          id: "order_3",
          status: "pending",
          source: "storefront",
          customerName: "Nina Shah",
          customerEmail: "b@example.com",
          paymentStatus: "pending",
          totalCents: 2500,
          amountDueCents: 2500,
          refundedCents: 0,
          currency: "USD",
          createdAt: "2026-06-07T08:00:00.000Z",
          items: [],
          refunds: [],
          returnRequests: [],
        },
        {
          id: "order_4",
          status: "cancelled",
          source: "manual",
          customerName: "Nina Shah",
          customerEmail: "b@example.com",
          paymentStatus: "voided",
          totalCents: 2500,
          amountDueCents: 0,
          refundedCents: 0,
          currency: "USD",
          createdAt: "2026-06-05T08:00:00.000Z",
          items: [],
          refunds: [],
          returnRequests: [],
        },
      ];
      const products = [
        {
          id: "p1",
          name: "Apex Jacket",
          status: "active",
          inventoryCount: 4,
        },
        {
          id: "p2",
          name: "Trail Hat",
          status: "active",
          inventoryCount: 12,
        },
      ];
      const abandonedCheckouts = [
        {
          id: "checkout_open",
          customerEmail: "cart@example.com",
          recoveryToken: "recover-open",
          status: "open",
          lines: [
            {
              productId: "p1",
              productName: "Apex Jacket",
              unitPriceCents: 4000,
              quantity: 1,
            },
          ],
          subtotalCents: 4000,
        },
        {
          id: "checkout_recovered",
          customerEmail: "buyer@example.com",
          recoveryToken: "recover-done",
          status: "recovered",
          lines: [],
          subtotalCents: 6000,
        },
      ];
      const summary = analytics.getStoreAnalytics({
        orders,
        products,
        abandonedCheckouts,
        storeId: "store_1",
        currency: "USD",
        now: new Date("2026-06-07T12:00:00.000Z"),
        dayCount: 3,
        lowStockThreshold: 5,
      });

      assertEqual(summary.grossSalesCents, 15000, "gross sales should use revenue orders");
      assertEqual(summary.netSalesCents, 13000, "net sales should subtract refunds");
      assertEqual(summary.refundCents, 2000, "refunds should sum revenue-order refunds");
      assertEqual(summary.pendingRevenueCents, 2500, "pending revenue should use amount due");
      assertEqual(
        summary.unfulfilledRevenueCents,
        8000,
        "unfulfilled revenue should count paid net sales awaiting fulfillment",
      );
      assertEqual(summary.averageOrderValueCents, 6500, "AOV should use net sales");
      assertEqual(summary.averageItemsPerPaidOrder, 2, "item average should use paid orders");
      assertEqual(summary.paidRate, 50, "paid rate should use all orders");
      assertEqual(summary.fulfillmentRate, 50, "fulfillment rate should use revenue orders");
      assertEqual(summary.refundRate, 13, "refund rate should be rounded");
      assertEqual(summary.repeatCustomerRate, 100, "repeat rate should use customer history");
      assertEqual(summary.returnRequestRate, 50, "return request rate should use revenue orders");
      assertEqual(summary.openReturnRequests, 1, "open return requests should be counted");
      assertEqual(
        summary.checkoutRecoveryRate,
        50,
        "checkout recovery should compare recovered carts with all abandoned carts",
      );
      assertEqual(
        summary.abandonedCheckoutValueCents,
        4000,
        "recoverable abandoned checkout value should be counted",
      );
      assertEqual(
        summary.recoveredCheckoutValueCents,
        6000,
        "recovered abandoned checkout value should be counted",
      );
      assertEqual(
        summary.customerConcentrationRate,
        100,
        "customer concentration should expose top customer sales share",
      );
      assertDeepEqual(
        summary.sourceMix.map((source) => [source.source, source.count, source.share]),
        [
          ["storefront", 2, 50],
          ["manual", 2, 50],
        ],
        "source mix should count all orders",
      );
      assertDeepEqual(
        summary.days.map((day) => [day.key, day.netSalesCents, day.orderCount]),
        [
          ["2026-06-05", 0, 0],
          ["2026-06-06", 8000, 1],
          ["2026-06-07", 5000, 1],
        ],
        "daily buckets should use paid date",
      );
      assertEqual(
        summary.topProducts[0].productName,
        "Apex Jacket",
        "top products should rank by net sales",
      );
      assertEqual(
        summary.topProducts[0].netSalesCents,
        9800,
        "top product should allocate refunds by order ratio",
      );
      assertDeepEqual(
        summary.topCustomers.map((customer) => [
          customer.customerEmail,
          customer.netSalesCents,
          customer.share,
        ]),
        [["a@example.com", 13000, 100]],
        "top customers should rank by net sales and expose concentration",
      );
      assertEqual(
        summary.lowStockProducts[0].id,
        "p1",
        "low stock should include active low inventory products",
      );
      assertDeepEqual(
        summary.insights.map((insight) => insight.id),
        [
          "low-stock-products",
          "fulfillment-backlog",
          "refund-exposure",
          "open-return-requests",
          "customer-concentration",
          "pending-revenue",
          "abandoned-checkout-recovery",
        ],
        "analytics insights should prioritize operational growth work",
      );
    },
  ],
  [
    "discounts floor percentages and never exceed subtotal",
    () => {
      assertEqual(
        businessRules.calculateDiscountCents({ type: "percent", value: 15 }, 999),
        149,
        "percent discount should floor fractional cents",
      );
      assertEqual(
        businessRules.calculateDiscountCents({ type: "percent", value: 200 }, 1200),
        1200,
        "percent discount should cap at subtotal",
      );
      assertEqual(
        businessRules.calculateDiscountCents({ type: "fixed", value: 2500 }, 1200),
        1200,
        "fixed discount should cap at subtotal",
      );
    },
  ],
  [
    "shipping chooses active country zones and free thresholds",
    () => {
      const zones = [
        {
          id: "us",
          countries: ["United States", "U.S.", "USA"],
          rateCents: 900,
          freeShippingThresholdCents: 5000,
          status: "active",
        },
        {
          id: "ca",
          countries: ["Canada"],
          rateCents: 1200,
          freeShippingThresholdCents: 0,
          status: "paused",
        },
      ];

      assertEqual(
        businessRules.calculateShippingQuote({
          discountedSubtotalCents: 4999,
          freeShippingThresholdCents: 10000,
          shippingCountry: "u.s.",
          shippingRateCents: 700,
          shippingZones: zones,
        }).shippingCents,
        900,
        "active country zone should override fallback rate",
      );
      assertEqual(
        businessRules.calculateShippingQuote({
          discountedSubtotalCents: 5000,
          freeShippingThresholdCents: 10000,
          shippingCountry: "United States",
          shippingRateCents: 700,
          shippingZones: zones,
        }).shippingCents,
        0,
        "zone free threshold should apply",
      );
      assertEqual(
        businessRules.calculateShippingQuote({
          discountedSubtotalCents: 4000,
          freeShippingThresholdCents: 10000,
          shippingCountry: "Canada",
          shippingRateCents: 700,
          shippingZones: zones,
        }).shippingCents,
        700,
        "paused zones should not match",
      );
      assertEqual(
        businessRules.calculateShippingQuote({
          discountedSubtotalCents: 0,
          freeShippingThresholdCents: 0,
          shippingCountry: "United States",
          shippingRateCents: 700,
          shippingZones: zones,
        }).shippingCents,
        0,
        "zero subtotal should not charge shipping",
      );
    },
  ],
  [
    "tax rounds cents and ignores non-positive inputs",
    () => {
      assertEqual(
        businessRules.calculateTaxCents(12345, 825),
        1018,
        "tax should round calculated cents",
      );
      assertEqual(
        businessRules.calculateTaxCents(0, 825),
        0,
        "zero subtotal should have zero tax",
      );
      assertEqual(
        businessRules.calculateTaxCents(1000, 0),
        0,
        "zero tax rate should have zero tax",
      );
    },
  ],
  [
    "checkout totals coordinate discount shipping tax and gift cards",
    () => {
      const zone = {
        id: "us",
        name: "United States",
        countries: ["United States"],
        rateCents: 500,
        freeShippingThresholdCents: 8000,
        status: "active",
      };
      const totals = businessRules.calculateCheckoutTotals({
        discountCents: 2500,
        freeShippingThresholdCents: 12000,
        giftCardCents: 3000,
        shippingCountry: "United States",
        shippingRateCents: 900,
        shippingZones: [zone],
        subtotalCents: 10000,
        taxRateBps: 1000,
      });

      assertDeepEqual(
        {
          subtotalCents: totals.subtotalCents,
          discountCents: totals.discountCents,
          discountedSubtotalCents: totals.discountedSubtotalCents,
          shippingCents: totals.shippingCents,
          taxCents: totals.taxCents,
          totalCents: totals.totalCents,
          giftCardCents: totals.giftCardCents,
          amountDueCents: totals.amountDueCents,
          shippingZoneName: totals.shippingZone?.name,
        },
        {
          subtotalCents: 10000,
          discountCents: 2500,
          discountedSubtotalCents: 7500,
          shippingCents: 500,
          taxCents: 750,
          totalCents: 8750,
          giftCardCents: 3000,
          amountDueCents: 5750,
          shippingZoneName: "United States",
        },
        "checkout totals should use the same math for order creation and display",
      );

      const capped = businessRules.calculateCheckoutTotals({
        discountCents: 9999,
        freeShippingThresholdCents: 0,
        giftCardCents: 9999,
        shippingCountry: "Mars",
        shippingRateCents: 700,
        shippingZones: [],
        subtotalCents: 4000,
        taxRateBps: 825,
      });

      assertDeepEqual(
        {
          discountCents: capped.discountCents,
          totalCents: capped.totalCents,
          giftCardCents: capped.giftCardCents,
          amountDueCents: capped.amountDueCents,
        },
        {
          discountCents: 4000,
          totalCents: 0,
          giftCardCents: 0,
          amountDueCents: 0,
        },
        "checkout totals should cap over-sized discount and gift card amounts",
      );
    },
  ],
  [
    "shipping countries and cart lines normalize repeat input",
    () => {
      assertDeepEqual(
        businessRules.parseShippingCountries("US, Canada\nUS\n  United Kingdom  "),
        ["US", "Canada", "United Kingdom"],
        "country parsing should trim and dedupe",
      );
      assertDeepEqual(
        businessRules.normalizeCartLines([
          { productId: "p1", quantity: 1 },
          { productId: "p1", variantId: "", quantity: 2 },
          { productId: "p1", variantId: "v1", quantity: 3 },
          { productId: "p1", variantId: "v1", quantity: 4 },
        ]),
        [
          { productId: "p1", quantity: 3 },
          { productId: "p1", variantId: "v1", quantity: 7 },
        ],
        "cart normalization should merge product and variant lines",
      );
      assertEqual(
        businessRules.normalizeCheckoutSessionId(" checkout_1234567890 "),
        "checkout_1234567890",
        "checkout session ids should trim safe retry keys",
      );
      assertEqual(
        businessRules.normalizeCheckoutSessionId("short"),
        null,
        "short checkout session ids should be rejected",
      );
      assertEqual(
        businessRules.normalizeCheckoutSessionId("unsafe/session/key"),
        null,
        "unsafe checkout session ids should be rejected",
      );
    },
  ],
  [
    "storefront navigation parses safe merchant menu links",
    () => {
      assertEqual(
        navigation.normalizeNavigationHref("www.example.com"),
        "https://www.example.com",
        "www links should normalize to https",
      );
      assertEqual(
        navigation.normalizeNavigationHref("//example.com"),
        null,
        "protocol-relative links should be rejected",
      );

      const parsed = navigation.parseNavigationMenuLines(
        [
          "Shop | /stores/demo",
          "Support | mailto:support@example.com",
          "Docs | https://example.com/docs",
          "Shop | /stores/demo",
          "Broken line",
          "Unsafe | javascript:alert(1)",
        ].join("\n"),
      );

      assertDeepEqual(
        parsed.links,
        [
          { label: "Shop", href: "/stores/demo" },
          { label: "Support", href: "mailto:support@example.com" },
          { label: "Docs", href: "https://example.com/docs" },
        ],
        "navigation parser should keep valid unique links",
      );
      assertEqual(parsed.errors.length, 2, "invalid navigation lines should be reported");
      assertDeepEqual(
        navigation.sanitizeNavigationLinks([
          { label: "  About  us ", href: " /about " },
          { label: "Script", href: "javascript:alert(1)" },
        ]),
        [{ label: "About us", href: "/about" }],
        "navigation rows should sanitize persisted JSON",
      );
    },
  ],
  [
    "store launch readiness blocks incomplete storefront publishing",
    () => {
      const readyWorkspace = {
        store: {
          id: "store_ready",
          name: "Ready Store",
          description: "A complete storefront ready for buyer checkout.",
          currency: "USD",
          themeColor: "#0f766e",
          seoTitle: "Ready Store",
          seoDescription: "A complete storefront ready for buyer checkout.",
          socialImageUrl: "https://example.com/social.jpg",
          status: "draft",
          shippingRateCents: 700,
          freeShippingThresholdCents: 5000,
          taxRateBps: 825,
        },
        products: [
          {
            id: "product_1",
            name: "Field Pack",
            slug: "field-pack",
            description: "A durable everyday pack with enough stock to sell.",
            imageUrl: "https://example.com/pack.jpg",
            priceCents: 12900,
            inventoryCount: 8,
            status: "active",
            variants: [],
          },
        ],
        policies: ["refund", "shipping", "privacy", "terms"].map((type) => ({
          type,
          body: "Published policy content that is long enough for storefront display.",
          status: "published",
        })),
        navigationMenus: [
          {
            location: "header",
            links: [{ label: "Shop", href: "/stores/ready" }],
          },
          {
            location: "footer",
            links: [{ label: "Refund policy", href: "/stores/ready/policies/refund" }],
          },
        ],
        shippingZones: [{ status: "active", countries: ["United States"] }],
        collections: [{ status: "active", productCount: 1 }],
        productReviews: [{ status: "approved" }],
      };
      const ready = launchReadiness.getStoreLaunchReadiness(readyWorkspace);

      assertTrue(ready.canPublish, "ready stores should pass launch blockers");
      assertEqual(ready.blockingCount, 0, "ready stores should have no blockers");
      assertEqual(ready.completionPercent, 100, "ready stores should score 100%");

      const incomplete = launchReadiness.getStoreLaunchReadiness({
        ...readyWorkspace,
        store: {
          ...readyWorkspace.store,
          description: "Short",
          shippingRateCents: -1,
        },
        policies: [],
        products: [
          {
            ...readyWorkspace.products[0],
            imageUrl: "",
            inventoryCount: 0,
          },
        ],
      });

      assertFalse(
        incomplete.canPublish,
        "incomplete stores should not pass launch blockers",
      );
      assertTrue(
        incomplete.blockingChecks.some((check) => check.id === "identity"),
        "short store descriptions should block launch",
      );
      assertTrue(
        incomplete.blockingChecks.some(
          (check) => check.id === "purchasable-products",
        ),
        "active products without image or stock should block launch",
      );
      assertTrue(
        incomplete.blockingChecks.some((check) => check.id === "policies"),
        "missing required policies should block launch",
      );
      assertTrue(
        incomplete.blockingChecks.some((check) => check.id === "checkout-rates"),
        "invalid checkout rates should block launch",
      );
    },
  ],
  [
    "customer profiles merge with order-derived customer summaries",
    () => {
      assertDeepEqual(
        customers.parseCustomerTags("VIP, vip\nWholesale,  Trail Team "),
        ["VIP", "Wholesale", "Trail Team"],
        "customer tags should trim, dedupe, and preserve display casing",
      );

      const summaries = customers.getCustomerSummaries(
        [
          {
            id: "order_1",
            customerName: "Mira Chen",
            customerEmail: "mira@example.com",
            customerPhone: "+1 415 000 0000",
            status: "paid",
            totalCents: 12000,
            refundedCents: 2000,
            currency: "USD",
            createdAt: "2026-05-01T10:00:00.000Z",
            fulfillments: [],
            refunds: [],
            returnRequests: [],
            paymentTransactions: [],
          },
          {
            id: "order_2",
            customerName: "Mira Chen",
            customerEmail: "mira@example.com",
            status: "fulfilled",
            totalCents: 8000,
            refundedCents: 0,
            currency: "USD",
            createdAt: "2026-05-10T10:00:00.000Z",
            fulfillments: [],
            refunds: [],
            returnRequests: [],
            paymentTransactions: [],
          },
          {
            id: "order_3",
            customerName: "Ari Patel",
            customerEmail: "ari@example.com",
            status: "cancelled",
            totalCents: 5000,
            refundedCents: 0,
            currency: "USD",
            createdAt: "2026-05-03T10:00:00.000Z",
            fulfillments: [],
            refunds: [],
            returnRequests: [],
            paymentTransactions: [],
          },
        ],
        "USD",
        [
          {
            id: "profile_mira",
            storeId: "store_1",
            email: "MIRA@example.com",
            name: "Mira C.",
            phone: "+1 415 111 1111",
            note: "Prefers low-waste packaging.",
            tags: ["vip"],
            acceptsMarketing: true,
            taxExempt: false,
            createdAt: "2026-04-30T10:00:00.000Z",
            updatedAt: "2026-05-11T10:00:00.000Z",
          },
          {
            id: "profile_lead",
            storeId: "store_1",
            email: "lead@example.com",
            name: "Lead Buyer",
            tags: ["lead"],
            acceptsMarketing: true,
            taxExempt: true,
            createdAt: "2026-05-12T10:00:00.000Z",
            updatedAt: "2026-05-12T10:00:00.000Z",
          },
        ],
      );
      const mira = customers.getCustomerByEmail(summaries, "MIRA@example.com");
      const lead = customers.getCustomerByEmail(summaries, "lead@example.com");
      const stats = customers.getCustomerStats(summaries);

      assertEqual(summaries.length, 3, "profiles should add customers without orders");
      assertEqual(mira.name, "Mira C.", "profile name should override order name");
      assertEqual(mira.phone, "+1 415 111 1111", "profile phone should override order phone");
      assertEqual(mira.totalSpentCents, 18000, "paid spend should subtract refunds");
      assertEqual(mira.lastOrderStatus, "fulfilled", "latest order should drive status");
      assertEqual(lead.orderCount, 0, "profile-only customers should have zero orders");
      assertEqual(lead.lastOrderStatus, undefined, "profile-only customers should not fake order status");
      assertTrue(lead.taxExempt, "profile-only tax flags should be preserved");
      assertEqual(stats.totalCustomers, 3, "stats should include profile-only customers");
      assertEqual(stats.repeatCustomers, 1, "repeat stats should still use order counts");
      assertEqual(stats.marketingOptIns, 2, "stats should count marketing consent");
      assertEqual(stats.leads, 1, "profile-only customers should count as leads");
      assertEqual(stats.vipCustomers, 1, "VIP tags should count VIP customers");
      assertEqual(
        customers.parseCustomerSegmentFilter("not-real"),
        "all",
        "invalid customer segment filters should fall back to all",
      );
      assertEqual(
        customers.parseCustomerMarketingFilter("maybe"),
        "all",
        "invalid customer marketing filters should fall back to all",
      );
      assertEqual(
        customers.parseCustomerOrderActivityFilter("stale"),
        "all",
        "invalid customer activity filters should fall back to all",
      );
      assertEqual(
        customers.parseCustomerSortOption("random"),
        "last_order_desc",
        "invalid customer sorts should fall back to latest activity",
      );
      assertDeepEqual(
        customers
          .filterCustomers({
            customers: summaries,
            query: "low-waste",
            segment: "all",
          })
          .map((customer) => customer.email),
        ["mira@example.com"],
        "customer search should include profile notes",
      );
      assertDeepEqual(
        customers
          .filterCustomers({
            customers: summaries,
            query: "",
            segment: "vip",
          })
          .map((customer) => customer.email),
        ["mira@example.com"],
        "customer segment filters should include VIP tags",
      );
      assertDeepEqual(
        customers
          .filterCustomers({
            customers: summaries,
            query: "",
            segment: "lead",
          })
          .map((customer) => customer.email),
        ["lead@example.com"],
        "customer segment filters should include profile-only leads",
      );
      assertDeepEqual(
        customers
          .filterCustomers({
            customers: summaries,
            query: "ari",
            segment: "all",
          })
          .map((customer) => customer.email),
        ["ari@example.com"],
        "customer search should include order-derived names and emails",
      );
      assertDeepEqual(
        customers
          .filterCustomers({
            customers: summaries,
            query: "",
            segment: "all",
            marketing: "subscribed",
          })
          .map((customer) => customer.email),
        ["lead@example.com", "mira@example.com"],
        "marketing filters should isolate customers with consent",
      );
      assertDeepEqual(
        customers
          .filterCustomers({
            customers: summaries,
            query: "",
            segment: "all",
            marketing: "not_subscribed",
          })
          .map((customer) => customer.email),
        ["ari@example.com"],
        "marketing filters should isolate customers without consent",
      );
      assertDeepEqual(
        customers
          .filterCustomers({
            customers: summaries,
            query: "",
            segment: "all",
            activity: "no_orders",
          })
          .map((customer) => customer.email),
        ["lead@example.com"],
        "activity filters should isolate profile-only customers",
      );
      assertDeepEqual(
        customers
          .filterCustomers({
            customers: summaries,
            query: "",
            segment: "all",
            activity: "repeat",
          })
          .map((customer) => customer.email),
        ["mira@example.com"],
        "activity filters should isolate repeat buyers",
      );
      assertDeepEqual(
        customers
          .filterCustomers({
            customers: summaries,
            query: "",
            segment: "all",
            sort: "spent_desc",
          })
          .map((customer) => customer.email),
        ["mira@example.com", "ari@example.com", "lead@example.com"],
        "customer sorting should surface highest spenders first",
      );
      assertDeepEqual(
        customers
          .filterCustomers({
            customers: summaries,
            query: "",
            segment: "all",
            sort: "risk_priority",
          })
          .map((customer) => customer.email),
        ["mira@example.com", "ari@example.com", "lead@example.com"],
        "risk sorting should prioritize VIP and active customer segments",
      );
    },
  ],
  [
    "customer segmentation identifies VIP, at-risk, leads, and refund-watch customers",
    () => {
      const baseCustomer = {
        profileId: "profile_1",
        email: "buyer@example.com",
        name: "Buyer",
        tags: [],
        acceptsMarketing: true,
        taxExempt: false,
        orderCount: 2,
        paidOrderCount: 2,
        totalSpentCents: 60000,
        currency: "USD",
        firstOrderAt: "2026-01-01T10:00:00.000Z",
        lastOrderAt: "2026-01-15T10:00:00.000Z",
        lastOrderStatus: "fulfilled",
        orders: [
          {
            id: "order_1",
            customerEmail: "buyer@example.com",
            status: "fulfilled",
            totalCents: 40000,
            refundedCents: 0,
            currency: "USD",
            createdAt: "2026-01-01T10:00:00.000Z",
          },
          {
            id: "order_2",
            customerEmail: "buyer@example.com",
            status: "fulfilled",
            totalCents: 20000,
            refundedCents: 0,
            currency: "USD",
            createdAt: "2026-01-15T10:00:00.000Z",
          },
        ],
      };
      const vip = customers.getCustomerSegmentation(baseCustomer, {
        now: new Date("2026-02-01T10:00:00.000Z"),
      });

      assertEqual(vip.primarySegment, "vip", "high spend repeat buyers should be VIP");
      assertTrue(vip.segments.includes("repeat"), "VIP customers can also be repeat buyers");
      assertEqual(vip.averageOrderValueCents, 30000, "AOV should use paid order count");

      const atRisk = customers.getCustomerSegmentation(
        {
          ...baseCustomer,
          totalSpentCents: 25000,
          lastOrderAt: "2026-01-01T10:00:00.000Z",
        },
        {
          now: new Date("2026-06-07T10:00:00.000Z"),
        },
      );

      assertEqual(atRisk.primarySegment, "at_risk", "inactive paid customers should be at risk");
      assertEqual(atRisk.daysSinceLastOrder, 157, "inactive days should be rounded down");

      const refundWatch = customers.getCustomerSegmentation(
        {
          ...baseCustomer,
          totalSpentCents: 30000,
          orders: [
            {
              id: "order_refund",
              customerEmail: "buyer@example.com",
              status: "paid",
              totalCents: 60000,
              refundedCents: 30000,
              currency: "USD",
              createdAt: "2026-05-01T10:00:00.000Z",
            },
          ],
          paidOrderCount: 1,
          orderCount: 1,
          lastOrderAt: "2026-05-01T10:00:00.000Z",
        },
        {
          now: new Date("2026-06-07T10:00:00.000Z"),
        },
      );

      assertEqual(
        refundWatch.primarySegment,
        "refund_watch",
        "high refund rates should outrank other customer segments",
      );
      assertEqual(refundWatch.refundRate, 50, "refund rate should use gross paid value");

      const lead = customers.getCustomerSegmentation({
        email: "lead@example.com",
        name: "Lead",
        tags: ["prospect"],
        acceptsMarketing: false,
        taxExempt: false,
        orderCount: 0,
        paidOrderCount: 0,
        totalSpentCents: 0,
        currency: "USD",
        orders: [],
      });

      assertEqual(lead.primarySegment, "lead", "profile-only contacts should be leads");
      assertEqual(
        lead.nextAction,
        "Add consent or context before sending marketing campaigns.",
        "lead next action should respect missing marketing consent",
      );
    },
  ],
  [
    "activity center prioritizes notification delivery issues and store audit work",
    () => {
      const notifications = [
        {
          id: "notification_sent",
          storeId: "store_1",
          type: "payment_receipt",
          status: "sent",
          recipientEmail: "buyer@example.com",
          recipientName: "Buyer",
          subject: "Payment received",
          preview: "Payment was confirmed.",
          resourceType: "order",
          resourceId: "order_1",
          metadata: { orderId: "order_1" },
          sentAt: "2026-06-07T10:10:00.000Z",
          createdAt: "2026-06-07T10:00:00.000Z",
        },
        {
          id: "notification_pending",
          storeId: "store_1",
          type: "return_request_updated",
          status: "pending",
          recipientEmail: "returns@example.com",
          subject: "Return updated",
          preview: "Your return request is approved.",
          resourceType: "order_return_request",
          resourceId: "return_1",
          metadata: { orderId: "order_1" },
          createdAt: "2026-06-07T09:30:00.000Z",
        },
        {
          id: "notification_failed",
          storeId: "store_1",
          type: "fulfillment_update",
          status: "failed",
          recipientEmail: "shipping@example.com",
          subject: "Shipment update",
          preview: "Shipment is in transit.",
          resourceType: "order_fulfillment",
          resourceId: "fulfillment_1",
          metadata: { orderId: "order_1" },
          failedAt: "2026-06-07T09:40:00.000Z",
          createdAt: "2026-06-07T09:20:00.000Z",
        },
      ];
      const auditEvents = [
        {
          id: "audit_order",
          storeId: "store_1",
          clerkUserId: "user_1",
          action: "order_status_updated",
          resourceType: "order",
          resourceId: "order_1",
          summary: "Merchant marked order paid.",
          metadata: {},
          createdAt: "2026-06-07T10:20:00.000Z",
        },
      ];

      const stats = activityCenter.getNotificationStats(notifications);
      const items = activityCenter.getActivityCenter(
        {
          auditEvents,
          notifications,
          storeId: "store_1",
        },
        { limit: 4 },
      );

      assertEqual(stats.total, 3, "activity stats should count all messages");
      assertEqual(stats.failed, 1, "activity stats should count failed messages");
      assertEqual(stats.pending, 1, "activity stats should count pending messages");
      assertEqual(
        stats.actionRequired,
        2,
        "pending and failed messages should require review",
      );
      assertDeepEqual(
        items.map((item) => item.id),
        [
          "notification:notification_failed",
          "notification:notification_pending",
          "audit:audit_order",
          "notification:notification_sent",
        ],
        "activity center should sort actionable notifications before informational activity",
      );
      assertEqual(
        items[0].href,
        "/dashboard/stores/store_1/orders/order_1",
        "fulfillment notifications should link back to the parent order",
      );
      assertEqual(
        items[1].resourceLabel,
        "Return request",
        "return request notifications should have merchant-readable resource labels",
      );
      assertEqual(items[2].label, "Audit", "audit entries should remain visible");
      assertDeepEqual(
        activityCenter
          .filterActivityCenterItems({
            items: activityCenter.getActivityCenterItems({
              auditEvents,
              notifications,
              storeId: "store_1",
            }),
            kind: "notification",
            priority: "critical",
            query: "shipping",
            sort: "priority",
          })
          .map((item) => item.id),
        ["notification:notification_failed"],
        "activity filters should find critical notification delivery issues",
      );
      assertDeepEqual(
        activityCenter
          .filterActivityCenterItems({
            items: activityCenter.getActivityCenterItems({
              auditEvents,
              notifications,
              storeId: "store_1",
            }),
            kind: "audit_event",
            priority: "all",
            query: "marked order",
            sort: "newest",
          })
          .map((item) => item.id),
        ["audit:audit_order"],
        "activity filters should search audit event summaries",
      );
      assertEqual(
        activityCenter.parseActivityCenterKindFilter("bad"),
        "all",
        "invalid activity kind filters should fall back to all",
      );
      assertEqual(
        activityCenter.parseActivityCenterPriorityFilter("bad"),
        "all",
        "invalid activity priority filters should fall back to all",
      );
      assertEqual(
        activityCenter.parseActivityCenterSortOption("bad"),
        "priority",
        "invalid activity sort options should fall back to priority",
      );
    },
  ],
  [
    "store operations insights prioritize launch, order, catalog, and conversion work",
    () => {
      const store = {
        ...mockData.mockStores[0],
        description: "Short",
        shippingRateCents: -100,
      };
      const brokenProduct = {
        ...mockData.mockProducts[0],
        id: "product_broken_ops",
        storeId: store.id,
        name: "Ops Broken Product",
        slug: "",
        sku: "",
        category: "",
        description: "Tiny",
        priceCents: 0,
        inventoryCount: 0,
        imageUrl: "",
        status: "active",
        variants: [],
      };
      const riskyOrder = {
        id: "order_risky_ops",
        storeId: store.id,
        customerName: "Risk Buyer",
        customerEmail: "risk@example.com",
        status: "pending",
        source: "storefront",
        paymentStatus: "pending",
        paymentMethod: "cash_on_delivery",
        paymentProvider: "Manual",
        subtotalCents: 125000,
        discountCents: 0,
        giftCardCents: 0,
        shippingCents: 0,
        taxCents: 0,
        taxRateBps: 0,
        totalCents: 125000,
        amountDueCents: 125000,
        refundedCents: 0,
        refundableCents: 125000,
        currency: "USD",
        createdAt: "2026-05-01T10:00:00.000Z",
        fulfillments: [],
        refunds: [],
        returnRequests: [
          {
            id: "return_ops",
            storeId: store.id,
            orderId: "order_risky_ops",
            customerEmail: "risk@example.com",
            status: "requested",
            reason: "damaged",
            note: "Package arrived damaged and needs merchant review.",
            requestedAt: "2026-06-06T09:00:00.000Z",
            createdAt: "2026-06-06T09:00:00.000Z",
            updatedAt: "2026-06-06T09:00:00.000Z",
          },
        ],
        paymentTransactions: [],
      };
      const workspace = {
        membershipRole: "owner",
        store,
        members: [],
        invitations: [],
        auditEvents: [],
        notifications: [
          {
            id: "notification_failed_ops",
            storeId: store.id,
            type: "fulfillment_update",
            status: "failed",
            recipientEmail: "risk@example.com",
            subject: "Shipment update",
            preview: "Shipment email could not be delivered.",
            resourceType: "order_fulfillment",
            resourceId: "fulfillment_ops",
            metadata: { orderId: "order_risky_ops" },
            failedAt: "2026-06-07T09:30:00.000Z",
            createdAt: "2026-06-07T09:00:00.000Z",
          },
          {
            id: "notification_pending_ops",
            storeId: store.id,
            type: "return_request_updated",
            status: "pending",
            recipientEmail: "risk@example.com",
            subject: "Return update",
            preview: "Return request update is still waiting.",
            resourceType: "order_return_request",
            resourceId: "return_ops",
            metadata: { orderId: "order_risky_ops" },
            createdAt: "2026-06-07T09:35:00.000Z",
          },
        ],
        policies: [],
        customPages: [],
        navigationMenus: [],
        customerProfiles: [],
        shippingZones: [],
        products: [brokenProduct],
        collections: [],
        orders: [riskyOrder],
        abandonedCheckouts: [
          {
            id: "checkout_ops",
            storeId: store.id,
            customerEmail: "cart@example.com",
            recoveryToken: "recover-ops-token",
            status: "open",
            lines: [
              {
                productId: "product_broken_ops",
                productName: "Ops Broken Product",
                unitPriceCents: 2500,
                quantity: 2,
              },
            ],
            subtotalCents: 5000,
            currency: "USD",
            lastSeenAt: "2026-06-07T09:00:00.000Z",
            recoveryEmailCount: 0,
            createdAt: "2026-06-07T09:00:00.000Z",
            updatedAt: "2026-06-07T09:00:00.000Z",
          },
        ],
        productReviews: [
          {
            id: "review_ops",
            storeId: store.id,
            productId: "product_broken_ops",
            orderId: "order_risky_ops",
            customerEmail: "risk@example.com",
            customerName: "Risk Buyer",
            rating: 4,
            body: "Pending review body.",
            status: "pending",
            reviewedAt: "2026-06-07T09:00:00.000Z",
            createdAt: "2026-06-07T09:00:00.000Z",
            updatedAt: "2026-06-07T09:00:00.000Z",
          },
        ],
        giftCards: [],
        discounts: [],
        inventoryAdjustments: [],
      };
      const insights = storeInsights.getStoreOperationalInsights(workspace, {
        now: new Date("2026-06-07T10:00:00.000Z"),
        limit: 20,
      });
      const insightIds = insights.map((insight) => insight.id);
      const categories = new Set(insights.map((insight) => insight.category));

      assertTrue(
        insightIds.includes("launch:identity"),
        "operations queue should include launch identity blockers",
      );
      assertTrue(
        insightIds.includes("order-risk:order_risky_ops"),
        "operations queue should include risky orders",
      );
      assertTrue(
        insightIds.includes("product-health:product_broken_ops"),
        "operations queue should include product health work",
      );
      assertTrue(
        insightIds.includes("inventory:product_broken_ops"),
        "operations queue should include inventory planning work",
      );
      assertTrue(
        insightIds.includes("abandoned-checkout:checkout_ops"),
        "operations queue should include recoverable abandoned carts",
      );
      assertTrue(
        insightIds.includes("pending-reviews"),
        "operations queue should include pending review moderation",
      );
      assertTrue(
        insightIds.includes("return-request:return_ops"),
        "operations queue should include return request work",
      );
      assertTrue(
        insightIds.includes("notification-failures"),
        "operations queue should include failed notification work",
      );
      assertTrue(
        insightIds.includes("notification-pending"),
        "operations queue should include pending notification work",
      );
      assertTrue(categories.has("launch"), "launch insights should be categorized");
      assertTrue(categories.has("orders"), "order insights should be categorized");
      assertTrue(categories.has("catalog"), "catalog insights should be categorized");
      assertTrue(categories.has("inventory"), "inventory insights should be categorized");
      assertTrue(categories.has("returns"), "return insights should be categorized");
      assertTrue(
        categories.has("notifications"),
        "notification insights should be categorized",
      );
      assertEqual(
        insights[0].severity,
        "critical",
        "critical work should sort to the top",
      );
    },
  ],
  [
    "order lifecycle prevents backwards transitions",
    () => {
      assertTrue(
        orderStatus.canTransitionOrderStatus("pending", "paid"),
        "pending orders should be payable",
      );
      assertTrue(
        orderStatus.canTransitionOrderStatus("paid", "fulfilled"),
        "paid orders should be fulfillable",
      );
      assertFalse(
        orderStatus.canTransitionOrderStatus("paid", "cancelled", "paid"),
        "captured paid orders should not be cancelled before refund or void",
      );
      assertTrue(
        orderStatus.canTransitionOrderStatus("paid", "cancelled", "refunded"),
        "fully refunded paid orders can be cancelled",
      );
      assertDeepEqual(
        orderStatus.getOrderStatusOptions("paid", "partially_refunded"),
        ["paid", "fulfilled"],
        "partially refunded paid orders should hide cancellation",
      );
      assertTrue(
        orderStatus.canCancelOrderPaymentStatus("authorized"),
        "authorized unpaid orders can be cancelled and voided",
      );
      assertFalse(
        orderStatus.canCancelOrderPaymentStatus("partially_refunded"),
        "partially refunded orders need completion before cancellation",
      );
      assertFalse(
        orderStatus.canTransitionOrderStatus("fulfilled", "cancelled"),
        "fulfilled orders should not be cancelled",
      );
      assertFalse(
        orderStatus.canTransitionOrderStatus("cancelled", "paid"),
        "cancelled orders should not be reopened as paid",
      );
    },
  ],
  [
    "roles enforce production admin boundaries",
    () => {
      assertTrue(
        permissions.canStoreRole("owner", "manage_team"),
        "owners should manage team access",
      );
      assertFalse(
        permissions.canStoreRole("admin", "manage_team"),
        "admins should not manage team access",
      );
      assertTrue(
        permissions.canStoreRole("staff", "manage_inventory"),
        "staff should manage inventory",
      );
      assertFalse(
        permissions.canStoreRole("staff", "manage_refunds"),
        "staff should not create refunds",
      );
      assertFalse(
        permissions.canStoreRole(undefined, "manage_orders"),
        "missing role should not manage orders",
      );
    },
  ],
  [
    "demo data is disabled by default in production",
    () => {
      const originalEnv = {
        ENABLE_DEMO_DATA: process.env.ENABLE_DEMO_DATA,
        NEXT_PUBLIC_ENABLE_DEMO_DATA: process.env.NEXT_PUBLIC_ENABLE_DEMO_DATA,
        NODE_ENV: process.env.NODE_ENV,
      };

      function restoreEnv() {
        for (const [key, value] of Object.entries(originalEnv)) {
          if (value === undefined) {
            delete process.env[key];
          } else {
            process.env[key] = value;
          }
        }
      }

      try {
        delete process.env.ENABLE_DEMO_DATA;
        delete process.env.NEXT_PUBLIC_ENABLE_DEMO_DATA;
        process.env.NODE_ENV = "development";
        assertTrue(
          runtimeEnv.isDemoDataEnabled(),
          "demo data should be enabled by default outside production",
        );

        process.env.NODE_ENV = "production";
        assertFalse(
          runtimeEnv.isDemoDataEnabled(),
          "demo data should be disabled by default in production",
        );

        process.env.ENABLE_DEMO_DATA = "true";
        assertTrue(
          runtimeEnv.isDemoDataEnabled(),
          "explicit demo opt-in should override production default",
        );

        process.env.ENABLE_DEMO_DATA = "false";
        process.env.NODE_ENV = "development";
        assertFalse(
          runtimeEnv.isDemoDataEnabled(),
          "explicit demo opt-out should override development default",
        );
      } finally {
        restoreEnv();
      }
    },
  ],
  [
    "cart permalinks serialize and normalize checkout carts",
    () => {
      const cartPayload = cartPermalinks.serializeCartPermalinkLines([
        {
          productId: "demo-product-hydra-bottle",
          variantId: "demo-variant-hydra-bottle-steel",
          quantity: 2,
        },
        {
          productId: "demo-product-hydra-bottle",
          variantId: "demo-variant-hydra-bottle-steel",
          quantity: 120,
        },
        {
          productId: "",
          quantity: 1,
        },
      ]);
      const parsed = cartPermalinks.parseCartPermalinkLines(cartPayload);

      assertDeepEqual(
        parsed,
        [
          {
            productId: "demo-product-hydra-bottle",
            variantId: "demo-variant-hydra-bottle-steel",
            quantity: 99,
          },
        ],
        "cart permalinks should merge duplicate lines and cap quantities",
      );
      assertEqual(
        cartPermalinks.getCheckoutPermalink("northline-supply", parsed),
        `/stores/northline-supply/checkout?cart=${encodeURIComponent(cartPayload)}`,
        "checkout permalinks should carry the encoded cart payload",
      );
      assertDeepEqual(
        cartPermalinks.parseCartPermalinkLines("not-json"),
        [],
        "invalid cart permalink payloads should be ignored",
      );
    },
  ],
  [
    "storefront catalog filters parse and serialize shareable URLs",
    () => {
      const parsed = catalogFilters.parseStorefrontCatalogFilters({
        q: "  bottle  ",
        category: "Drinkware",
        availability: "available",
        sort: "price-asc",
      });

      assertDeepEqual(
        parsed,
        {
          query: "bottle",
          category: "Drinkware",
          availability: "available",
          sort: "price-asc",
        },
        "catalog filters should normalize valid query params",
      );
      assertEqual(
        catalogFilters.serializeStorefrontCatalogFilters(parsed),
        "q=bottle&category=Drinkware&availability=available&sort=price-asc",
        "catalog filters should serialize non-default values",
      );
      assertTrue(
        catalogFilters.hasActiveStorefrontCatalogFilters(parsed),
        "non-default catalog filters should be active",
      );

      const defaults = catalogFilters.parseStorefrontCatalogFilters({
        q: "   ",
        availability: "retired",
        sort: "random",
      });

      assertDeepEqual(
        defaults,
        catalogFilters.defaultStorefrontCatalogFilters,
        "invalid catalog filters should fall back to defaults",
      );
      assertEqual(
        catalogFilters.serializeStorefrontCatalogFilters(defaults),
        "",
        "default catalog filters should serialize to an empty query string",
      );
    },
  ],
  [
    "request guards limit repeated public writes",
    () => {
      const key = "business-rules-request-guard";
      const policy = {
        limit: 2,
        windowMs: 1000,
      };
      const first = requestGuards.consumeRateLimit(key, policy, 1000);
      const second = requestGuards.consumeRateLimit(key, policy, 1100);
      const third = requestGuards.consumeRateLimit(key, policy, 1200);
      const afterReset = requestGuards.consumeRateLimit(key, policy, 2101);
      const fingerprint = requestGuards.getClientFingerprint(
        new Request("https://example.test", {
          headers: {
            "user-agent": "CheckoutBot",
            "x-forwarded-for": "203.0.113.7, 10.0.0.1",
          },
        }),
      );
      const headerFingerprint = requestGuards.getClientFingerprintFromHeaders(
        new Headers({
          "cf-connecting-ip": "198.51.100.8",
          "user-agent": "ServerActionClient",
        }),
      );
      const contentLengthOk = requestGuards.getContentLengthLimitError(
        new Headers({ "content-length": "4096" }),
        4096,
      );
      const contentLengthTooLarge = requestGuards.getContentLengthLimitError(
        new Headers({ "content-length": "4097" }),
        4096,
      );

      assertTrue(first.ok, "first request should be accepted");
      assertTrue(second.ok, "second request inside the limit should be accepted");
      assertFalse(third.ok, "third request inside the limit should be rejected");
      assertEqual(
        third.retryAfterSeconds,
        1,
        "rejected requests should include a retry window",
      );
      assertTrue(afterReset.ok, "requests should be accepted after the window resets");
      assertEqual(
        fingerprint,
        "203.0.113.7:CheckoutBot",
        "fingerprints should prefer forwarded client IP and user agent",
      );
      assertEqual(
        headerFingerprint,
        "198.51.100.8:ServerActionClient",
        "server action fingerprints should work from header collections",
      );
      assertEqual(
        contentLengthOk,
        null,
        "content-length equal to the limit should be accepted",
      );
      assertEqual(
        contentLengthTooLarge.status,
        413,
        "oversized content-length should be rejected before body parsing",
      );
    },
  ],
];

const failures = [];

for (const [name, run] of tests) {
  try {
    run();
  } catch (error) {
    failures.push({
      name,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

if (failures.length > 0) {
  console.error("Business rules check failed:");
  for (const failure of failures) {
    console.error(`- ${failure.name}: ${failure.message}`);
  }
  process.exit(1);
}

console.log(`Business rules check passed (${tests.length} tests).`);
