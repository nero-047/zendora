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
const policies = loadTsModule("features/commerce/policies.ts");
const seo = loadTsModule("features/commerce/seo.ts");
const payments = loadTsModule("features/commerce/payments.ts");
const returns = loadTsModule("features/commerce/returns.ts");
const abandonedCheckouts = loadTsModule(
  "features/commerce/abandoned-checkouts.ts",
);
const permissions = loadTsModule("features/commerce/permissions.ts");
const mockData = loadTsModule("features/commerce/mock-data.ts");

const tests = [
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
    },
  ],
  [
    "store SEO falls back cleanly and prefers merchant settings",
    () => {
      const store = {
        name: "Northline Supply",
        description: "Premium everyday goods.",
        seoTitle: "Northline Supply | Durable gear",
        seoDescription: "Shop durable everyday gear from Northline Supply.",
        socialImageUrl: "https://example.com/social.jpg",
      };

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
        seo.getStoreSeoDescription({ name: "Draft", description: "" }),
        "Draft storefront.",
        "metadata should fall back when no description exists",
      );
    },
  ],
  [
    "return requests require paid orders without active requests",
    () => {
      const baseOrder = {
        status: "fulfilled",
        paymentStatus: "paid",
        refundableCents: 5000,
        returnRequests: [],
      };

      assertTrue(
        returns.canCustomerRequestReturn(baseOrder),
        "fulfilled paid orders should accept return requests",
      );
      assertFalse(
        returns.canCustomerRequestReturn({
          ...baseOrder,
          status: "pending",
        }),
        "pending orders should not accept return requests",
      );
      assertFalse(
        returns.canCustomerRequestReturn({
          ...baseOrder,
          refundableCents: 0,
        }),
        "fully refunded orders should not accept return requests",
      );
      assertFalse(
        returns.canCustomerRequestReturn({
          ...baseOrder,
          returnRequests: [{ status: "requested" }],
        }),
        "orders with active return requests should not accept duplicates",
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
    "store analytics summarizes sales, refunds, mix, and products",
    () => {
      const orders = [
        {
          id: "order_1",
          status: "paid",
          source: "storefront",
          customerEmail: "a@example.com",
          totalCents: 10000,
          refundedCents: 2000,
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
        },
        {
          id: "order_2",
          status: "fulfilled",
          source: "manual",
          customerEmail: "a@example.com",
          totalCents: 5000,
          refundedCents: 0,
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
        },
        {
          id: "order_3",
          status: "pending",
          source: "storefront",
          customerEmail: "b@example.com",
          totalCents: 2500,
          refundedCents: 0,
          createdAt: "2026-06-07T08:00:00.000Z",
          items: [],
          refunds: [],
        },
        {
          id: "order_4",
          status: "cancelled",
          source: "manual",
          customerEmail: "b@example.com",
          totalCents: 2500,
          refundedCents: 0,
          createdAt: "2026-06-05T08:00:00.000Z",
          items: [],
          refunds: [],
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
      const summary = analytics.getStoreAnalytics({
        orders,
        products,
        now: new Date("2026-06-07T12:00:00.000Z"),
        dayCount: 3,
        lowStockThreshold: 5,
      });

      assertEqual(summary.grossSalesCents, 15000, "gross sales should use revenue orders");
      assertEqual(summary.netSalesCents, 13000, "net sales should subtract refunds");
      assertEqual(summary.refundCents, 2000, "refunds should sum revenue-order refunds");
      assertEqual(summary.averageOrderValueCents, 6500, "AOV should use net sales");
      assertEqual(summary.averageItemsPerPaidOrder, 2, "item average should use paid orders");
      assertEqual(summary.paidRate, 50, "paid rate should use all orders");
      assertEqual(summary.fulfillmentRate, 50, "fulfillment rate should use revenue orders");
      assertEqual(summary.refundRate, 13, "refund rate should be rounded");
      assertEqual(summary.repeatCustomerRate, 100, "repeat rate should use customer history");
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
      assertEqual(
        summary.lowStockProducts[0].id,
        "p1",
        "low stock should include active low inventory products",
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
