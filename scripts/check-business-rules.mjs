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
const storePages = loadTsModule("features/commerce/store-pages.ts");
const seo = loadTsModule("features/commerce/seo.ts");
const payments = loadTsModule("features/commerce/payments.ts");
const orderInsights = loadTsModule("features/commerce/order-insights.ts");
const returns = loadTsModule("features/commerce/returns.ts");
const reviews = loadTsModule("features/commerce/reviews.ts");
const giftCards = loadTsModule("features/commerce/gift-cards.ts");
const fulfillments = loadTsModule("features/commerce/fulfillments.ts");
const customers = loadTsModule("features/commerce/customers.ts");
const navigation = loadTsModule("features/commerce/navigation.ts");
const cartPermalinks = loadTsModule("features/commerce/cart-permalinks.ts");
const catalogFilters = loadTsModule("features/commerce/catalog-filters.ts");
const launchReadiness = loadTsModule("features/commerce/launch-readiness.ts");
const abandonedCheckouts = loadTsModule(
  "features/commerce/abandoned-checkouts.ts",
);
const permissions = loadTsModule("features/commerce/permissions.ts");
const requestGuards = loadTsModule("lib/request-guards.ts");
const runtimeEnv = loadTsModule("lib/env.ts");
const mockData = loadTsModule("features/commerce/mock-data.ts");

const tests = [
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
