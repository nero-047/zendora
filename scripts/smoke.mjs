const args = new Set(process.argv.slice(2));
const requireReadiness = args.has("--require-readiness");
const baseUrl = (
  process.env.SMOKE_BASE_URL ||
  process.argv.find((arg) => arg.startsWith("--base-url="))?.split("=")[1] ||
  "http://localhost:3000"
).replace(/\/$/, "");

async function request(path, init) {
  const response = await fetch(`${baseUrl}${path}`, {
    redirect: "manual",
    ...init,
  });
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  return { response, body };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function getAssertableHtml(body) {
  return body
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s+/g, " ");
}

function assertSecurityHeaders(result, path) {
  const headers = result.response.headers;
  const csp = headers.get("content-security-policy") || "";

  assert(
    headers.get("x-content-type-options") === "nosniff",
    `${path} is missing X-Content-Type-Options=nosniff.`,
  );
  assert(
    headers.get("x-frame-options") === "DENY",
    `${path} is missing X-Frame-Options=DENY.`,
  );
  assert(
    headers.get("referrer-policy") === "strict-origin-when-cross-origin",
    `${path} is missing strict Referrer-Policy.`,
  );
  assert(
    (headers.get("permissions-policy") || "").includes("camera=()"),
    `${path} is missing restrictive Permissions-Policy.`,
  );
  assert(
    (headers.get("strict-transport-security") || "").includes(
      "max-age=31536000",
    ),
    `${path} is missing Strict-Transport-Security.`,
  );
  assert(
    csp.includes("default-src 'self'") &&
      csp.includes("object-src 'none'") &&
      csp.includes("frame-ancestors 'none'"),
    `${path} is missing the expected Content-Security-Policy baseline.`,
  );
  assert(
    !headers.has("x-powered-by"),
    `${path} should not expose the Next.js powered-by header.`,
  );
}

async function run() {
  const checks = [];

  function assertHtmlRoute(check, result) {
    assert(
      result.response.status === 200,
      `${check.path} did not return 200. Status: ${result.response.status}`,
    );
    assert(
      typeof result.body === "string",
      `${check.path} did not return an HTML response.`,
    );

    const assertableBody = check.visibleOnly
      ? getAssertableHtml(result.body)
      : result.body.replace(/<!--[\s\S]*?-->/g, "");
    const visibleBody = getAssertableHtml(result.body);

    for (const expectedText of check.includes) {
      assert(
        assertableBody.includes(expectedText),
        `${check.path} did not render expected text: ${expectedText}`,
      );
    }

    for (const excludedText of check.excludes || []) {
      assert(
        !visibleBody.includes(excludedText),
        `${check.path} rendered excluded text: ${excludedText}`,
      );
    }
  }

  async function checkHtmlRoute(check) {
    const result = await request(check.path);
    assertHtmlRoute(check, result);
    checks.push(check.label);
  }

  async function checkNotFoundRoute(check) {
    const result = await request(check.path);
    const visibleBody =
      typeof result.body === "string" ? getAssertableHtml(result.body) : "";

    assert(
      result.response.status === 404,
      `${check.path} should return 404. Status: ${result.response.status}`,
    );
    assert(
      visibleBody.includes("noindex"),
      `${check.path} should include noindex metadata.`,
    );

    for (const expectedText of check.includes || []) {
      assert(
        visibleBody.includes(expectedText),
        `${check.path} did not render expected 404 text: ${expectedText}`,
      );
    }

    for (const excludedText of check.excludes || []) {
      assert(
        !visibleBody.includes(excludedText),
        `${check.path} rendered private text despite 404: ${excludedText}`,
      );
    }

    checks.push(check.label);
  }

  async function checkProtectedDashboardRoute(check) {
    const result = await request(check.path);

    if (result.response.status === 307 || result.response.status === 308) {
      const location = result.response.headers.get("location") || "";
      assert(
        location.includes("/sign-in") || location.includes("/dashboard"),
        `${check.path} redirected to an unexpected location: ${location}`,
      );
      checks.push(`${check.label} auth redirect`);
      return;
    }

    assertHtmlRoute(check, result);
    checks.push(check.label);
  }

  async function checkProtectedCsvRoute(check) {
    const result = await request(check.path);

    if (result.response.status === 307 || result.response.status === 308) {
      const location = result.response.headers.get("location") || "";
      assert(
        location.includes("/sign-in") || location.includes("/dashboard"),
        `${check.path} redirected to an unexpected location: ${location}`,
      );
      checks.push(`${check.label} auth redirect`);
      return;
    }

    assert(
      result.response.status === 200,
      `${check.path} did not return 200. Status: ${result.response.status}`,
    );
    assert(
      (result.response.headers.get("content-type") || "").includes("text/csv"),
      `${check.path} did not return a CSV response.`,
    );
    assert(
      (result.response.headers.get("content-disposition") || "").includes(
        "attachment",
      ),
      `${check.path} did not return an attachment download.`,
    );
    assert(
      typeof result.body === "string",
      `${check.path} did not return a text response.`,
    );

    for (const expectedText of check.includes) {
      assert(
        result.body.includes(expectedText),
        `${check.path} did not render expected CSV text: ${expectedText}`,
      );
    }

    checks.push(check.label);
  }

  async function checkAbandonedCheckoutApi() {
    const emailSuffix = `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`;
    const validCapture = await request(
      "/api/stores/northline-supply/abandoned-checkouts",
      {
        body: JSON.stringify({
          customerEmail: `smoke-${emailSuffix}@example.com`,
          customerName: "Smoke Test",
          cart: [
            {
              productId: "demo-product-hydra-bottle",
              variantId: "demo-variant-hydra-bottle-steel",
              quantity: 2,
            },
          ],
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      },
    );

    assert(
      validCapture.response.status === 200,
      `abandoned checkout capture did not return 200. Status: ${validCapture.response.status}`,
    );
    assert(
      validCapture.body?.ok === true &&
        typeof validCapture.body.recoveryToken === "string" &&
        validCapture.body.recoveryToken.length >= 16,
      "abandoned checkout capture did not return a recovery token.",
    );

    const invalidCapture = await request(
      "/api/stores/northline-supply/abandoned-checkouts",
      {
        body: JSON.stringify({
          customerEmail: `smoke-invalid-${emailSuffix}@example.com`,
          cart: [
            {
              productId: "missing-product",
              quantity: 1,
            },
          ],
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      },
    );

    assert(
      invalidCapture.response.status === 400,
      `invalid abandoned checkout capture should return 400. Status: ${invalidCapture.response.status}`,
    );
    assert(
      invalidCapture.body?.ok === false &&
        String(invalidCapture.body.error || "").includes("unavailable"),
      "invalid abandoned checkout capture should explain unavailable cart items.",
    );

    checks.push("abandoned checkout api");
  }

  const health = await request("/api/health");
  assert(health.response.status === 200, "/api/health did not return 200.");
  assert(health.body?.ok === true, "/api/health did not report ok=true.");
  checks.push("health");

  const home = await request("/");
  assert(home.response.status === 200, "/ did not return 200.");
  assert(
    typeof home.body === "string" && home.body.includes("Zendora"),
    "/ did not render Zendora content.",
  );
  assertSecurityHeaders(home, "/");
  checks.push("home");
  checks.push("security headers");

  const dashboard = await request("/dashboard");
  assert(
    dashboard.response.status === 307 || dashboard.response.status === 200,
    "/dashboard should return 307 when signed out or 200 when signed in.",
  );
  checks.push("dashboard");

  const readiness = await request("/api/readiness");

  if (requireReadiness) {
    assert(
      readiness.response.status === 200,
      `/api/readiness did not return 200. Status: ${readiness.response.status}`,
    );
    assert(
      readiness.body?.ok === true,
      "/api/readiness did not report ok=true.",
    );
  } else {
    assert(
      readiness.response.status === 200 || readiness.response.status === 503,
      "/api/readiness should return 200 or configuration-focused 503.",
    );
  }

  checks.push("readiness");

  const robots = await request("/robots.txt");
  assert(robots.response.status === 200, "/robots.txt did not return 200.");
  assert(
    typeof robots.body === "string" &&
      robots.body.includes("Disallow: /dashboard/") &&
      robots.body.includes("Sitemap:"),
    "/robots.txt did not expose private-route rules and sitemap location.",
  );
  checks.push("robots");

  const sitemap = await request("/sitemap.xml");
  assert(sitemap.response.status === 200, "/sitemap.xml did not return 200.");
  assert(
    typeof sitemap.body === "string" &&
      sitemap.body.includes("/stores/northline-supply") &&
      sitemap.body.includes("/stores/northline-supply/products/field-carry-pack") &&
      !sitemap.body.includes("/dashboard/") &&
      !sitemap.body.includes("/checkout"),
    "/sitemap.xml did not expose only public storefront URLs.",
  );
  checks.push("sitemap");

  const storefrontChecks = [
    {
      label: "storefront",
      path: "/stores/northline-supply",
      includes: [
        "Northline Supply",
        "Field Carry Pack",
        "Checkout",
        '"@type":"Store"',
      ],
    },
    {
      label: "product",
      path: "/stores/northline-supply/products/field-carry-pack",
      includes: [
        "Field Carry Pack",
        "Weather-resistant",
        "Add to cart",
        '"@type":"Product"',
      ],
    },
    {
      label: "collection",
      path: "/stores/northline-supply/collections/everyday-carry",
      includes: ["Everyday Carry", "Field Carry Pack", '"@type":"CollectionPage"'],
    },
    {
      label: "filtered collection",
      path: "/stores/northline-supply/collections/everyday-carry?q=bottle&sort=price-asc",
      includes: ["Hydra Bottle", "1 of 3 products"],
      excludes: ["Field Carry Pack", "Trail Watch"],
      visibleOnly: true,
    },
    {
      label: "checkout",
      path: "/stores/northline-supply/checkout",
      includes: ["Checkout", "Customer", "Delivery", "noindex"],
    },
    {
      label: "cart permalink checkout",
      path: "/stores/northline-supply/checkout?cart=%5B%7B%22productId%22%3A%22demo-product-hydra-bottle%22%2C%22variantId%22%3A%22demo-variant-hydra-bottle-steel%22%2C%22quantity%22%3A2%7D%5D",
      includes: [
        "Hydra Bottle",
        "demo-variant-hydra-bottle-steel",
        "quantity&quot;:2",
      ],
    },
    {
      label: "order receipt",
      path: "/stores/northline-supply/orders/demo-order-1001?token=demo-token-1001",
      includes: [
        "Order received",
        "Payment summary",
        "Request return",
        "noindex",
      ],
    },
    {
      label: "store page",
      path: "/stores/northline-supply/pages/about",
      includes: ["About Northline", "Northline Supply"],
    },
    {
      label: "store policy",
      path: "/stores/northline-supply/policies/refund",
      includes: ["Refund policy", "returns for unused items"],
    },
  ];

  for (const check of storefrontChecks) {
    await checkHtmlRoute(check);
  }

  await checkNotFoundRoute({
    label: "invalid order token",
    path: "/stores/northline-supply/orders/demo-order-1001?token=invalid-token",
    excludes: ["Order received", "Payment summary", "Request return"],
  });

  await checkNotFoundRoute({
    label: "missing dashboard store",
    path: "/dashboard/stores/missing-store",
    excludes: ["Northline Supply", "Mira Chen", "Hydra Bottle"],
  });

  await checkAbandonedCheckoutApi();

  const dashboardChecks = [
    {
      label: "dashboard content",
      path: "/dashboard",
      includes: ["Commerce command center", "Northline Supply", "Low stock"],
    },
    {
      label: "store operations content",
      path: "/dashboard/stores/demo-store-outdoor",
      includes: [
        "Northline Supply",
        "Launch readiness",
        "Activity center",
        "Activity workspace",
        "Operations queue",
        "Recovery workspace",
        "Save collection",
        "Save zone",
        "Save discount",
        "Save gift card",
      ],
    },
    {
      label: "admin analytics content",
      path: "/dashboard/stores/demo-store-outdoor/analytics",
      includes: [
        "Analytics",
        "Orders",
        "Customer concentration",
        "Refund",
        "Export CSV",
      ],
    },
    {
      label: "admin activity outbox content",
      path: "/dashboard/stores/demo-store-outdoor/activity?priority=critical&q=tracking",
      includes: [
        "Activity and outbox",
        "Notifications",
        "Needs review",
        "Search activity",
        "Failed Fulfillment update",
        "Ari Patel",
        "Tracking details could not be delivered.",
        "Fulfillment",
        "Export CSV",
      ],
    },
    {
      label: "admin checkout recovery content",
      path: "/dashboard/stores/demo-store-outdoor/checkouts?q=bottle&status=open",
      includes: [
        "Checkout recovery workspace",
        "Recoverable carts",
        "Search checkouts",
        "Nina Brooks",
        "Field Carry Pack",
        "Hydra Bottle",
        "Open",
        "Export CSV",
        "Send",
        "Dismiss",
      ],
    },
    {
      label: "admin inventory workspace content",
      path: "/dashboard/stores/demo-store-outdoor/inventory?q=bottle&sort=stock_asc",
      includes: [
        "Inventory workspace",
        "Action required",
        "Reorder now",
        "Search inventory",
        "Hydra Bottle",
        "Inventory history",
        "Two bottles removed after inspection.",
      ],
    },
    {
      label: "admin products content",
      path: "/dashboard/stores/demo-store-outdoor/products?q=bottle&sort=inventory_asc",
      includes: [
        "Product catalog",
        "Hydra Bottle",
        "Needs attention",
        "Search products",
      ],
    },
    {
      label: "admin product create content",
      path: "/dashboard/stores/demo-store-outdoor/products/new",
      includes: ["Add product", "Images upload", "Product name", "Save product"],
    },
    {
      label: "admin product edit content",
      path: "/dashboard/stores/demo-store-outdoor/products/demo-product-hydra-bottle/edit",
      includes: [
        "Edit product",
        "Hydra Bottle",
        "Catalog health",
        "Inventory history",
        "Save product",
      ],
    },
    {
      label: "admin orders content",
      path: "/dashboard/stores/demo-store-outdoor/orders?q=mira",
      includes: [
        "Order workspace",
        "Mira Chen",
        "Showing 1-1 of 1 matching orders",
        "Details",
      ],
    },
    {
      label: "admin order detail content",
      path: "/dashboard/stores/demo-store-outdoor/orders/demo-order-1001",
      includes: [
        "Fulfillment state",
        "Risk review",
        "Payment due",
        "Settlement",
        "Items",
        "Refund",
        "Payment",
        "Product reviews",
        "Clean, durable, and easy to wear",
        "Payment ledger",
        "Net collected",
        "Ledger delta",
        "Fulfillment",
        "Add shipment",
        "Timeline",
        "Invoice",
        "Packing slip",
      ],
    },
    {
      label: "admin order invoice document",
      path: "/dashboard/stores/demo-store-outdoor/orders/demo-order-1001/invoice",
      includes: [
        "Invoice",
        "Order demo-ord",
        "Mira Chen",
        "Bill to",
        "Ship to",
        "Payment",
        "Field Carry Pack",
        "Subtotal",
        "Total",
      ],
    },
    {
      label: "admin order packing slip document",
      path: "/dashboard/stores/demo-store-outdoor/orders/demo-order-1001/packing-slip",
      includes: [
        "Packing slip",
        "Order demo-ord",
        "Ship to",
        "Shipment",
        "Pick",
        "Field Carry Pack",
        "Customer note",
        "Leave at the front desk.",
      ],
    },
    {
      label: "admin return/refund fulfillment content",
      path: "/dashboard/stores/demo-store-outdoor/orders/demo-order-1002",
      includes: [
        "Return requests",
        "Changed mind",
        "Save return status",
        "Refund history",
        "Bottle returned unopened",
        "UPS",
        "Tracking link",
        "Save review status",
        "Payment refunds",
      ],
    },
    {
      label: "admin customers content",
      path: "/dashboard/stores/demo-store-outdoor/customers?segment=vip&sort=risk_priority",
      includes: ["Customers", "Mira", "VIP", "Marketing"],
    },
    {
      label: "admin customer detail content",
      path: "/dashboard/stores/demo-store-outdoor/customers/mira%40example.com",
      includes: [
        "Mira Chen",
        "Customer segment",
        "Order history",
        "Customer profile",
        "Save profile",
        "Merchant note",
        "Prefers low-waste packaging",
        "Shipping",
        "Customer notes",
      ],
    },
  ];

  for (const check of dashboardChecks) {
    await checkProtectedDashboardRoute(check);
  }

  const dashboardCsvChecks = [
    {
      label: "admin analytics csv export",
      path: "/dashboard/stores/demo-store-outdoor/analytics/export",
      includes: [
        "section,metric,label,value,count,detail,date,href",
        "kpi,net_sales,Net sales",
        "daily_sales,daily_net_sales",
        "product_performance,top_product",
      ],
    },
    {
      label: "admin activity csv export",
      path: "/dashboard/stores/demo-store-outdoor/activity/export?priority=critical&q=tracking",
      includes: [
        "activity_id,kind,priority,title",
        "notification:",
        "Failed Fulfillment update",
        "Tracking details could not be delivered.",
      ],
    },
    {
      label: "admin checkouts csv export",
      path: "/dashboard/stores/demo-store-outdoor/checkouts/export?q=bottle&status=open",
      includes: [
        "checkout_id,customer_name,customer_email",
        "demo-abandoned-checkout-1004",
        "Nina Brooks",
        "Hydra Bottle",
      ],
    },
    {
      label: "admin orders csv export",
      path: "/dashboard/stores/demo-store-outdoor/orders/export?q=mira",
      includes: [
        "order_id,customer_name,customer_email",
        "demo-order-1001",
        "Mira Chen",
      ],
    },
    {
      label: "admin products csv export",
      path: "/dashboard/stores/demo-store-outdoor/products/export?q=bottle&sort=inventory_asc",
      includes: [
        "product_id,name,slug",
        "demo-product-hydra-bottle",
        "Hydra Bottle",
      ],
    },
    {
      label: "admin inventory csv export",
      path: "/dashboard/stores/demo-store-outdoor/inventory/export?q=bottle&sort=stock_asc",
      includes: [
        "product_id,name,sku,category,priority",
        "demo-product-hydra-bottle",
        "Hydra Bottle",
        "Drinkware",
      ],
    },
    {
      label: "admin customers csv export",
      path: "/dashboard/stores/demo-store-outdoor/customers/export?segment=vip&sort=risk_priority",
      includes: ["email,name,phone", "mira@example.com", "Mira Chen"],
    },
  ];

  for (const check of dashboardCsvChecks) {
    await checkProtectedCsvRoute(check);
  }

  console.log(
    `Smoke checks passed for ${baseUrl}: ${checks.join(", ")}${
      requireReadiness ? " (strict readiness)" : ""
    }`,
  );
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
