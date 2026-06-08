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

  async function checkCheckoutPreviewApi() {
    const validPreview = await request(
      "/api/stores/northline-supply/checkout-preview",
      {
        body: JSON.stringify({
          cart: [
            {
              productId: "demo-product-hydra-bottle",
              variantId: "demo-variant-hydra-bottle-steel",
              quantity: 2,
            },
	          ],
	          customerEmail: "ari@example.com",
	          discountCode: "WELCOME10",
	          giftCardCode: "SUMMER-5000",
	          shippingCountry: "United States",
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      },
    );

    assert(
      validPreview.response.status === 200,
      `checkout preview did not return 200. Status: ${validPreview.response.status}`,
    );
    assert(
      validPreview.body?.ok === true &&
        validPreview.body.discountCode === "WELCOME10" &&
        validPreview.body.giftCardCode === "SUMMER-5000" &&
	        validPreview.body.totals?.discountCents > 0 &&
	        validPreview.body.totals?.giftCardCents > 0 &&
	        validPreview.body.taxExempt === true &&
	        validPreview.body.totals?.taxCents === 0 &&
	        validPreview.body.totals?.amountDueCents <
	          validPreview.body.totals?.totalCents,
	      "checkout preview did not validate promo, gift card, and tax-exempt savings.",
	    );

    const invalidPreview = await request(
      "/api/stores/northline-supply/checkout-preview",
      {
        body: JSON.stringify({
          cart: [
            {
              productId: "demo-product-hydra-bottle",
              variantId: "demo-variant-hydra-bottle-steel",
              quantity: 1,
            },
          ],
          discountCode: "NOPE",
          shippingCountry: "United States",
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      },
    );

    assert(
      invalidPreview.response.status === 400,
      `invalid checkout preview should return 400. Status: ${invalidPreview.response.status}`,
    );
    assert(
      invalidPreview.body?.ok === false &&
        String(invalidPreview.body.error || "").includes("not found"),
      "invalid checkout preview should explain missing discount codes.",
    );

    checks.push("checkout preview api");
  }

  async function checkGiftCardBalanceApi() {
    const validBalance = await request(
      "/api/stores/northline-supply/gift-cards/balance",
      {
        body: JSON.stringify({
          code: " summer 5000 ",
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      },
    );

    assert(
      validBalance.response.status === 200,
      `gift card balance did not return 200. Status: ${validBalance.response.status}`,
    );
    assert(
      validBalance.body?.ok === true &&
        validBalance.body.card?.code === "**** 5000" &&
        validBalance.body.card?.balanceCents === 5000 &&
        validBalance.body.card?.currency === "USD" &&
        validBalance.body.card?.redeemable === true,
      "gift card balance did not return the expected masked active card.",
    );

    const invalidBalance = await request(
      "/api/stores/northline-supply/gift-cards/balance",
      {
        body: JSON.stringify({
          code: "NOPE-4040",
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      },
    );

    assert(
      invalidBalance.response.status === 404,
      `invalid gift card balance should return 404. Status: ${invalidBalance.response.status}`,
    );
    assert(
      invalidBalance.body?.ok === false &&
        String(invalidBalance.body.error || "").includes("not found"),
      "invalid gift card balance should explain missing cards.",
    );

    checks.push("gift card balance api");
  }

  async function checkStoreContactApi() {
    const validContact = await request("/api/stores/northline-supply/contact", {
      body: JSON.stringify({
        email: "mira@example.com",
        message: "Can you confirm whether this pack fits a laptop?",
        name: "Mira Chen",
        orderId: "demo-order-1001",
        reason: "product",
        subject: "Size question",
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    assert(
      validContact.response.status === 200,
      `store contact did not return 200. Status: ${validContact.response.status}`,
    );
    assert(
      validContact.body?.ok === true &&
        String(validContact.body.ticketId || "").startsWith("demo-contact-"),
      "store contact did not return a demo support ticket reference.",
    );

    const invalidContact = await request("/api/stores/northline-supply/contact", {
      body: JSON.stringify({
        email: "bad-email",
        message: "short",
        name: "M",
        reason: "other",
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    assert(
      invalidContact.response.status === 400,
      `invalid store contact should return 400. Status: ${invalidContact.response.status}`,
    );
    assert(
      invalidContact.body?.ok === false &&
        String(invalidContact.body.error || "").includes("contact request"),
      "invalid store contact should explain malformed contact details.",
    );

    checks.push("store contact api");
  }

  async function checkProductQuestionApi() {
    const validQuestion = await request(
      "/api/stores/northline-supply/products/demo-product-carry-pack/questions",
      {
        body: JSON.stringify({
          email: "nina@example.com",
          message: "Does the Field Carry Pack fit a 15 inch laptop?",
          name: "Nina Brooks",
          topic: "compatibility",
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      },
    );

    assert(
      validQuestion.response.status === 200,
      `product question did not return 200. Status: ${validQuestion.response.status}`,
    );
    assert(
      validQuestion.body?.ok === true &&
        String(validQuestion.body.questionId || "").startsWith(
          "demo-product-question-",
        ),
      "product question did not return a demo support reference.",
    );

    const invalidQuestion = await request(
      "/api/stores/northline-supply/products/demo-product-carry-pack/questions",
      {
        body: JSON.stringify({
          email: "bad-email",
          message: "short",
          name: "N",
          topic: "unknown",
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      },
    );

    assert(
      invalidQuestion.response.status === 400,
      `invalid product question should return 400. Status: ${invalidQuestion.response.status}`,
    );
    assert(
      invalidQuestion.body?.ok === false &&
        String(invalidQuestion.body.error || "").includes("product question"),
      "invalid product question should explain malformed question details.",
    );

    checks.push("product question api");
  }

  async function checkNewsletterSignupApi() {
    const validSignup = await request("/api/stores/northline-supply/newsletter", {
      body: JSON.stringify({
        acceptsMarketing: true,
        email: "june@example.com",
        name: "June Miles",
        source: "smoke",
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    assert(
      validSignup.response.status === 200,
      `newsletter signup did not return 200. Status: ${validSignup.response.status}`,
    );
    assert(
      validSignup.body?.ok === true &&
        String(validSignup.body.profileId || "").startsWith("demo-newsletter-"),
      "newsletter signup did not return a demo customer profile reference.",
    );

    const invalidSignup = await request(
      "/api/stores/northline-supply/newsletter",
      {
        body: JSON.stringify({
          acceptsMarketing: false,
          email: "bad-email",
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      },
    );

    assert(
      invalidSignup.response.status === 400,
      `invalid newsletter signup should return 400. Status: ${invalidSignup.response.status}`,
    );
    assert(
      invalidSignup.body?.ok === false &&
        String(invalidSignup.body.error || "").includes("newsletter signup"),
      "invalid newsletter signup should explain malformed signup details.",
    );

    checks.push("newsletter signup api");
  }

  async function checkRestockAlertApi() {
    const validAlert = await request("/api/stores/northline-supply/restock-alerts", {
      body: JSON.stringify({
        acceptsMarketing: true,
        email: "nina@example.com",
        name: "Nina Brooks",
        productId: "demo-product-carry-pack",
        variantId: "demo-variant-carry-pack-forest",
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    assert(
      validAlert.response.status === 200,
      `restock alert did not return 200. Status: ${validAlert.response.status}`,
    );
    assert(
      validAlert.body?.ok === true &&
        String(validAlert.body.alertId || "").startsWith("demo-restock-"),
      "restock alert did not return a demo alert reference.",
    );

    const invalidAlert = await request(
      "/api/stores/northline-supply/restock-alerts",
      {
        body: JSON.stringify({
          acceptsMarketing: false,
          email: "bad-email",
          productId: "demo-product-carry-pack",
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      },
    );

    assert(
      invalidAlert.response.status === 400,
      `invalid restock alert should return 400. Status: ${invalidAlert.response.status}`,
    );
    assert(
      invalidAlert.body?.ok === false &&
        String(invalidAlert.body.error || "").includes("restock alert"),
      "invalid restock alert should explain malformed alert details.",
    );

    checks.push("restock alert api");
  }

  async function checkPrivacyRequestApi() {
    const validRequest = await request(
      "/api/stores/northline-supply/privacy-requests",
      {
        body: JSON.stringify({
          email: "mira@example.com",
          message: "Please send a copy of my order and profile data.",
          name: "Mira Chen",
          orderId: "demo-order-1001",
          requestType: "access",
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      },
    );

    assert(
      validRequest.response.status === 200,
      `privacy request did not return 200. Status: ${validRequest.response.status}`,
    );
    assert(
      validRequest.body?.ok === true &&
        String(validRequest.body.requestId || "").startsWith("demo-privacy-"),
      "privacy request did not return a demo request reference.",
    );

    const invalidRequest = await request(
      "/api/stores/northline-supply/privacy-requests",
      {
        body: JSON.stringify({
          email: "bad-email",
          requestType: "unknown",
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      },
    );

    assert(
      invalidRequest.response.status === 400,
      `invalid privacy request should return 400. Status: ${invalidRequest.response.status}`,
    );
    assert(
      invalidRequest.body?.ok === false &&
        String(invalidRequest.body.error || "").includes("privacy request"),
      "invalid privacy request should explain malformed privacy request details.",
    );

    checks.push("privacy request api");
  }

  async function checkOrderCancellationRequestApi() {
    const validRequest = await request(
      "/api/stores/northline-supply/orders/demo-order-1001/cancellation-requests",
      {
        body: JSON.stringify({
          message: "Please cancel this order before it ships.",
          reason: "changed_mind",
          token: "demo-token-1001",
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      },
    );

    assert(
      validRequest.response.status === 200,
      `order cancellation request did not return 200. Status: ${validRequest.response.status}`,
    );
    assert(
      validRequest.body?.ok === true &&
        String(validRequest.body.requestId || "").startsWith("demo-cancellation-"),
      "order cancellation request did not return a demo request reference.",
    );

    const invalidRequest = await request(
      "/api/stores/northline-supply/orders/demo-order-1001/cancellation-requests",
      {
        body: JSON.stringify({
          reason: "unknown",
          token: "demo-token-1001",
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      },
    );

    assert(
      invalidRequest.response.status === 400,
      `invalid cancellation request should return 400. Status: ${invalidRequest.response.status}`,
    );
    assert(
      invalidRequest.body?.ok === false &&
        String(invalidRequest.body.error || "").includes("cancellation request"),
      "invalid cancellation request should explain malformed details.",
    );

    checks.push("order cancellation request api");
  }

  async function checkOrderDeliveryRequestApi() {
    const validRequest = await request(
      "/api/stores/northline-supply/orders/demo-order-1001/delivery-requests",
      {
        body: JSON.stringify({
          message: "Please leave the package with the front desk.",
          requestType: "delivery_instructions",
          token: "demo-token-1001",
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      },
    );

    assert(
      validRequest.response.status === 200,
      `order delivery request did not return 200. Status: ${validRequest.response.status}`,
    );
    assert(
      validRequest.body?.ok === true &&
        String(validRequest.body.requestId || "").startsWith("demo-delivery-"),
      "order delivery request did not return a demo request reference.",
    );

    const invalidRequest = await request(
      "/api/stores/northline-supply/orders/demo-order-1001/delivery-requests",
      {
        body: JSON.stringify({
          message: "short",
          requestType: "unknown",
          token: "demo-token-1001",
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      },
    );

    assert(
      invalidRequest.response.status === 400,
      `invalid delivery request should return 400. Status: ${invalidRequest.response.status}`,
    );
    assert(
      invalidRequest.body?.ok === false &&
        String(invalidRequest.body.error || "").includes("delivery request"),
      "invalid delivery request should explain malformed details.",
    );

    checks.push("order delivery request api");
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
      robots.body.includes("Disallow: /stores/*/cart") &&
      robots.body.includes("Disallow: /stores/*/checkout") &&
      robots.body.includes("Disallow: /stores/*/compare") &&
      robots.body.includes("Disallow: /stores/*/gift-cards") &&
      robots.body.includes("Disallow: /stores/*/orders") &&
      robots.body.includes("Disallow: /stores/*/privacy-requests") &&
      robots.body.includes("Disallow: /stores/*/recently-viewed") &&
      robots.body.includes("Disallow: /stores/*/search") &&
      robots.body.includes("Disallow: /stores/*/wishlist") &&
      robots.body.includes("Sitemap:"),
    "/robots.txt did not expose private-route rules and sitemap location.",
  );
  checks.push("robots");

  const sitemap = await request("/sitemap.xml");
  assert(sitemap.response.status === 200, "/sitemap.xml did not return 200.");
  assert(
    typeof sitemap.body === "string" &&
      sitemap.body.includes("/stores/northline-supply") &&
      sitemap.body.includes("/stores/northline-supply/contact") &&
      sitemap.body.includes("/stores/northline-supply/products/field-carry-pack") &&
      sitemap.body.includes("/stores/northline-supply/collections</loc>") &&
      sitemap.body.includes("/stores/northline-supply/collections/all</loc>") &&
      sitemap.body.includes("/stores/northline-supply/collections/everyday-carry") &&
      sitemap.body.includes("/stores/northline-supply/policies") &&
      !sitemap.body.includes("/dashboard/") &&
      !sitemap.body.includes("/cart") &&
      !sitemap.body.includes("/compare") &&
      !sitemap.body.includes("/orders") &&
      !sitemap.body.includes("/privacy-requests") &&
      !sitemap.body.includes("/recently-viewed") &&
      !sitemap.body.includes("/search") &&
      !sitemap.body.includes("/wishlist") &&
      !sitemap.body.includes("/checkout"),
    "/sitemap.xml did not expose only indexable public storefront URLs.",
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
        "Contact",
        "Newsletter",
        "Join the Northline Supply list",
        "Subscribe",
        "Mobile storefront navigation",
        "Wishlist",
        "Recently viewed",
        "Save to wishlist",
        "Compare",
        "Min price",
        "Max price",
        "On sale",
        "Sale",
        "50.00",
        "Color: Forest",
        "Color: Clay",
        "Color: Brushed steel",
        "Policies",
        '"@type":"Store"',
      ],
    },
    {
      label: "cart",
      path: "/stores/northline-supply/cart",
      includes: [
        "Shopping cart",
        "Order summary",
        "Estimate order",
        "Discount code",
        "Gift card",
        "Shipping estimate",
        "Free shipping progress",
        "Tax estimate",
        "Continue shopping",
        "Checkout",
        "noindex",
      ],
    },
    {
      label: "storefront search",
      path: "/stores/northline-supply/search?q=bottle&category=Drinkware&availability=available&minPrice=40&maxPrice=45&sale=true&sort=price-asc",
      includes: [
        "Search Northline Supply",
        "Store search",
        "Hydra Bottle",
        "1 result",
        "Drinkware",
        "Min price",
        "Max price",
        "On sale",
        "Sale",
        "50.00",
        "noindex",
      ],
      excludes: ["Field Carry Pack", "Trail Watch"],
      visibleOnly: true,
    },
    {
      label: "product",
      path: "/stores/northline-supply/products/field-carry-pack",
      includes: [
        "Field Carry Pack",
        "Weather-resistant",
        "Quantity",
        "Decrease purchase quantity for Field Carry Pack",
        "Increase purchase quantity for Field Carry Pack",
        "Add to cart",
        "Buy now",
        "Checkout cart",
        "Save to wishlist",
        "Customer reviews",
        "No approved reviews yet",
        "Product questions",
        "Ask about Field Carry Pack",
        "Ask question",
        "Restock alerts",
        "Notify me about Field Carry Pack",
        "Related products",
        "Complete the set",
        "Pairs from Everyday Carry",
        "Hydra Bottle",
        "Trail Watch",
        '"@type":"Product"',
      ],
      excludes: [
        "Packed better than expected",
        "This carry pack has thoughtful pockets",
      ],
    },
    {
      label: "product sale pricing",
      path: "/stores/northline-supply/products/hydra-bottle",
      includes: [
        "Hydra Bottle",
        "42.00",
        "50.00",
        "Sale",
        "Save",
        "8.00",
        "Selected variant",
        "Brushed steel",
        "NLS-BOT-003-STL",
        "Low stock: 4 left",
        "Quantity",
        "Add to cart",
        "Buy now",
      ],
    },
    {
      label: "product selected variant",
      path: "/stores/northline-supply/products/field-carry-pack?variant=demo-variant-carry-pack-clay",
      includes: [
        "Field Carry Pack",
        "Selected variant",
        "Clay",
        "NLS-BAG-001-CLA",
        "18 in stock",
        "139.00",
        "Quantity",
        "Add to cart",
        "Buy now",
        "No approved reviews yet",
      ],
      excludes: [
        "Packed better than expected",
        "This carry pack has thoughtful pockets",
      ],
    },
    {
      label: "product approved reviews",
      path: "/stores/northline-supply/products/trail-watch",
      includes: [
        "Trail Watch",
        "Customer reviews",
        "5 / 1 reviews",
        "Rating breakdown",
        "5 stars",
        "1 verified",
        "Verified purchase",
        "Clean, durable, and easy to wear",
        "Merchant reply",
        "Thanks Mira. We are glad it is working well on the trail.",
      ],
      excludes: [
        "Packed better than expected",
        "This carry pack has thoughtful pockets",
      ],
    },
    {
      label: "collection",
      path: "/stores/northline-supply/collections/everyday-carry",
      includes: [
        "Everyday Carry",
        "Field Carry Pack",
        "Compare products",
        "Save to wishlist",
        "Color: Forest",
        "Color: Clay",
        '"@type":"CollectionPage"',
      ],
    },
    {
      label: "product comparison",
      path: "/stores/northline-supply/compare?products=field-carry-pack,hydra-bottle,trail-watch",
      includes: [
        "Product comparison",
        "Compare products",
        "Field Carry Pack",
        "Hydra Bottle",
        "Trail Watch",
        "Available stock",
        "Options",
        "View product",
        "noindex",
      ],
    },
    {
      label: "wishlist",
      path: "/stores/northline-supply/wishlist",
      includes: [
        "Wishlist",
        "Saved products",
        "Continue shopping",
        "noindex",
      ],
    },
    {
      label: "recently viewed",
      path: "/stores/northline-supply/recently-viewed",
      includes: [
        "Recently viewed",
        "Viewed products",
        "Continue shopping",
        "noindex",
      ],
    },
    {
      label: "collections index",
      path: "/stores/northline-supply/collections",
      includes: [
        "Shop collections",
        "All products",
        "Everyday Carry",
        "Trail Ready",
      ],
    },
    {
      label: "all products collection",
      path: "/stores/northline-supply/collections/all?q=bottle&sort=price-asc",
      includes: ["All products", "Hydra Bottle", "1 of 4 products"],
      excludes: ["Field Carry Pack", "Trail Watch"],
      visibleOnly: true,
    },
    {
      label: "sale price filtered collection",
      path: "/stores/northline-supply/collections/all?minPrice=40&maxPrice=45&sale=true",
      includes: [
        "All products",
        "Hydra Bottle",
        "1 of 4 products",
        "Min price",
        "Max price",
        "On sale",
        "Sale",
        "50.00",
      ],
      excludes: ["Field Carry Pack", "Trail Watch", "Sprint Shoe"],
      visibleOnly: true,
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
      includes: [
        "Checkout",
        "Customer",
        "Email me with news and offers",
        "Delivery",
        "Country / region",
        "United Kingdom",
        "noindex",
      ],
    },
    {
      label: "order lookup",
      path: "/stores/northline-supply/orders",
      includes: [
        "Find your order",
        "Order status",
        "Order details",
        "Delivery updates",
        "Self service",
        "noindex",
      ],
    },
    {
      label: "gift card balance",
      path: "/stores/northline-supply/gift-cards",
      includes: [
        "Gift card balance",
        "Balance check",
        "Check balance",
        "noindex",
      ],
    },
    {
      label: "store contact",
      path: "/stores/northline-supply/contact",
      includes: [
        "Contact Northline Supply",
        "Customer support",
        "Order ID",
        "Send message",
      ],
    },
    {
      label: "cart permalink checkout",
      path: "/stores/northline-supply/checkout?cart=%5B%7B%22productId%22%3A%22demo-product-hydra-bottle%22%2C%22variantId%22%3A%22demo-variant-hydra-bottle-steel%22%2C%22quantity%22%3A2%7D%5D&discountCode=WELCOME10&giftCardCode=SUMMER-5000",
      includes: [
        "Hydra Bottle",
        "demo-variant-hydra-bottle-steel",
        "quantity&quot;:2",
        "WELCOME10",
        "SUMMER-5000",
      ],
    },
    {
      label: "order receipt",
      path: "/stores/northline-supply/orders/demo-order-1001?token=demo-token-1001",
      includes: [
        "Order received",
        "Payment summary",
        "Buy again",
        "Rebuild checkout with 2 available items",
        "Print invoice",
        "Track order",
        "Cancellation request",
        "Request cancellation",
        "Delivery update request",
        "Request delivery update",
        "Request return",
        "noindex",
      ],
    },
    {
      label: "order invoice",
      path: "/stores/northline-supply/orders/demo-order-1001/invoice?token=demo-token-1001",
      includes: [
        "Customer invoice",
        "Invoice demo-ord",
        "Order receipt",
        "Print invoice",
        "Bill to",
        "Ship to",
        "Total",
        "noindex",
      ],
    },
    {
      label: "order tracking",
      path: "/stores/northline-supply/orders/demo-order-1002/tracking?token=demo-token-1002",
      includes: [
        "Order tracking",
        "Order receipt",
        "Delivered",
        "UPS",
        "1Z999AA10123456784",
        "Carrier tracking",
        "Tracking timeline",
        "Delivery address",
        "noindex",
      ],
    },
    {
      label: "store page",
      path: "/stores/northline-supply/pages/about",
      includes: ["About Northline", "Northline Supply"],
    },
    {
      label: "store policies index",
      path: "/stores/northline-supply/policies",
      includes: [
        "Store policies",
        "Privacy requests",
        "Refund policy",
        "Shipping policy",
        "Privacy policy",
        "Terms of service",
      ],
    },
    {
      label: "store policy",
      path: "/stores/northline-supply/policies/refund",
      includes: ["Refund policy", "returns for unused items"],
    },
    {
      label: "privacy policy",
      path: "/stores/northline-supply/policies/privacy",
      includes: ["Privacy policy", "Privacy requests"],
    },
    {
      label: "privacy request",
      path: "/stores/northline-supply/privacy-requests",
      includes: [
        "Privacy request",
        "Data access",
        "Submit request",
        "noindex",
      ],
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
    label: "invalid order invoice token",
    path: "/stores/northline-supply/orders/demo-order-1001/invoice?token=invalid-token",
    excludes: ["Customer invoice", "Bill to", "Print invoice"],
  });

  await checkNotFoundRoute({
    label: "invalid order tracking token",
    path: "/stores/northline-supply/orders/demo-order-1002/tracking?token=invalid-token",
    excludes: ["Order tracking", "Carrier tracking", "Tracking timeline"],
  });

  await checkNotFoundRoute({
    label: "missing dashboard store",
    path: "/dashboard/stores/missing-store",
    excludes: ["Northline Supply", "Mira Chen", "Hydra Bottle"],
  });

  await checkAbandonedCheckoutApi();
  await checkCheckoutPreviewApi();
  await checkGiftCardBalanceApi();
  await checkStoreContactApi();
  await checkProductQuestionApi();
  await checkNewsletterSignupApi();
  await checkRestockAlertApi();
  await checkPrivacyRequestApi();
  await checkOrderCancellationRequestApi();
  await checkOrderDeliveryRequestApi();

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
        "Export CSV",
        "Config CSV",
        "SEO CSV",
        "Marketing CSV",
        "Team CSV",
        "Recovery workspace",
        "Save collection",
        "Collections CSV",
        "Save zone",
        "Shipping CSV",
        "Save discount",
        "Discount Performance CSV",
        "Save gift card",
        "Gift Cards CSV",
        "Promotion CSV",
        "Returns CSV",
        "Return SLA CSV",
        "Review Queue CSV",
        "Reviews CSV",
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
        "Funnel CSV",
        "Payments CSV",
        "Payouts CSV",
        "Product Sales CSV",
        "Tax CSV",
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
        "Outbox CSV",
        "Support CSV",
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
        "Recovery CSV",
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
        "Reorder CSV",
        "PO CSV",
        "Alerts CSV",
        "Value CSV",
        "Inventory history",
        "Two bottles removed after inspection.",
        "History CSV",
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
        "Variants CSV",
        "Product Feed CSV",
        "Import Template",
        "Import Products",
      ],
    },
    {
      label: "admin product import content",
      path: "/dashboard/stores/demo-store-outdoor/products/import",
      includes: [
        "Import products",
        "CSV file",
        "CSV rows",
        "Import Template",
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
        "Export CSV",
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
        "Financial",
        "Open balances",
        "Ledger issues",
        "Fulfillment CSV",
        "Pick List CSV",
        "Manifest CSV",
        "SLA CSV",
        "Risk CSV",
        "Payments Due CSV",
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
        "Export CSV",
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
      includes: [
        "Customers",
        "Mira",
        "VIP",
        "Marketing",
        "Segments CSV",
        "LTV CSV",
        "Retention CSV",
        "Privacy CSV",
      ],
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
        "Export CSV",
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
      label: "admin store operations csv export",
      path: "/dashboard/stores/demo-store-outdoor/export",
      includes: [
        "section,metric,label,value,status,detail,href",
        "summary,launch_readiness,Launch readiness",
        "launch_readiness,identity,Store identity",
        "operations_queue",
      ],
    },
    {
      label: "admin store configuration csv export",
      path: "/dashboard/stores/demo-store-outdoor/configuration/export",
      includes: [
        "section,metric,label,value,status,detail,href",
        "store,name,Store name,Northline Supply",
        "policy,refund,Refund policy",
        "navigation,header,Header navigation",
        "shipping_zone,demo-shipping-zone-us,United States",
        "collection,demo-collection-everyday-carry,Everyday Carry",
      ],
    },
    {
      label: "admin seo csv export",
      path: "/dashboard/stores/demo-store-outdoor/seo/export",
      includes: [
        "resource_type,resource_id,label,status,indexable,canonical_url,seo_title,seo_description",
        "store,demo-store-outdoor,Northline Supply,Active,true",
        "product,demo-product-hydra-bottle,Hydra Bottle,Active,true",
        "page,demo-page-wholesale,Wholesale,Draft,false",
      ],
    },
    {
      label: "admin shipping rate matrix csv export",
      path: "/dashboard/stores/demo-store-outdoor/shipping/export",
      includes: [
        "row_type,zone_id,zone_name,status,country,checkout_priority,rate,rate_cents,free_shipping_threshold",
        "store_default,store_default,Store default,Fallback,*,999",
        "shipping_zone,demo-shipping-zone-us,United States,Active,US",
        "shipping_zone,demo-shipping-zone-ca-eu,Canada and Europe,Active,Canada",
        "Use only when no specific active zone matches the checkout country.",
      ],
    },
    {
      label: "admin marketing audience csv export",
      path: "/dashboard/stores/demo-store-outdoor/marketing/export",
      includes: [
        "audience,recipient_email,recipient_name,consent,campaign,priority,segment,campaign_eligible",
        "checkout_recovery,nina@example.com,Nina Brooks,true,Cart recovery,critical",
        "customer,mira@example.com,Mira Chen,true,VIP early access,high,VIP,true",
        "customer,zoe@example.com,Zoe Lambert,true,Welcome offer,medium,Lead,true",
        "Do not send promotional campaigns until consent and customer context are safe.",
      ],
    },
    {
      label: "admin collections csv export",
      path: "/dashboard/stores/demo-store-outdoor/collections/export",
      includes: [
        "collection_id,collection_title,collection_slug,collection_status",
        "demo-collection-everyday-carry,Everyday Carry,everyday-carry,Active",
        "demo-product-hydra-bottle",
        "/stores/northline-supply/collections/everyday-carry",
      ],
    },
    {
      label: "admin team access csv export",
      path: "/dashboard/stores/demo-store-outdoor/team/export",
      includes: [
        "section,metric,label,value,count,status,detail,date,href",
        "access_summary,current_user_role,Current user role,owner",
        "team_member,demo_user_zendora,Store owner,founder@zendora.dev",
        "permission_matrix,owner:manage_team,manage team access,Allowed",
        "permission_matrix,staff:manage_team,manage team access,Denied",
      ],
    },
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
      label: "admin conversion funnel csv export",
      path: "/dashboard/stores/demo-store-outdoor/analytics/funnel/export",
      includes: [
        "section,metric,label,value,count,rate,status,detail,href",
        "funnel_summary,checkout_starts,Checkout starts",
        "funnel_summary,recoverable_checkouts,Recoverable checkouts",
        "product_funnel,demo-product-hydra-bottle,Hydra Bottle",
        "Recovery opportunity",
        "/dashboard/stores/demo-store-outdoor/checkouts?status=open&sort=recovery_priority",
      ],
    },
    {
      label: "admin tax csv export",
      path: "/dashboard/stores/demo-store-outdoor/analytics/taxes/export",
      includes: [
        "section,metric,label,value,count,status,detail,date,href",
        "tax_summary,tax_collected,Tax collected",
        "tax_region,United States / TX",
        "tax_order,demo-order-1001,Mira Chen",
        "pending_tax_order,demo-order-1003,Sam Rivera",
      ],
    },
    {
      label: "admin payments csv export",
      path: "/dashboard/stores/demo-store-outdoor/analytics/payments/export",
      includes: [
        "section,metric,label,value,count,status,detail,date,href",
        "payment_summary,net_captured,Net captured",
        "payment_transaction,demo-payment-1001-capture,Capture",
        "payment_transaction,demo-payment-1002-refund,Refund",
        "order_financial,demo-order-1003,Sam Rivera",
      ],
    },
    {
      label: "admin payouts csv export",
      path: "/dashboard/stores/demo-store-outdoor/analytics/payouts/export",
      includes: [
        "section,metric,label,value,count,status,detail,date,href",
        "payout_summary,net_payout,Net payout",
        "payout_batch,2026-05-25:Manual card,Manual card",
        "payout_transaction,demo-payment-1001-capture,Capture",
        "Ready for finance review.",
        "estimated fee",
      ],
    },
    {
      label: "admin product sales analytics csv export",
      path: "/dashboard/stores/demo-store-outdoor/analytics/products/export",
      includes: [
        "row_type,product_id,product_name,product_status,category,sku,variant_id,variant_name,variant_status,units_sold,order_count,gross_sales,refund_allocated,net_sales,net_sales_share,average_unit_price,current_inventory,sales_signal,href",
        "product,demo-product-hydra-bottle,Hydra Bottle,Active,Drinkware,NLS-BOT-003",
        "variant,demo-product-hydra-bottle,Hydra Bottle,Active,Drinkware,NLS-BOT-003,demo-variant-hydra-bottle-onyx,Color: Onyx,Active",
        "Selling",
        "/dashboard/stores/demo-store-outdoor/products/demo-product-hydra-bottle/edit",
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
      label: "admin notification outbox csv export",
      path: "/dashboard/stores/demo-store-outdoor/activity/outbox/export",
      includes: [
        "notification_id,type,status,priority,recipient_email,recipient_name,subject,preview,resource_type,resource_id,age_hours,recommended_action,created_at,sent_at,failed_at,href",
        "demo-notification-customer-message,Customer message,Pending",
        "Northline Supply contact: Size question,Can you confirm whether the Field Carry Pack fits a 15 inch laptop?",
        "Reply to the customer or assign the message from the support queue.",
        "demo-notification-product-question,Customer message,Pending",
        "Northline Supply product question: Field Carry Pack / Compatibility,Does the Field Carry Pack fit a 15 inch laptop and a water bottle?",
        "Answer the product question before the customer leaves the product page.",
        "demo-notification-privacy-request,Customer message,Pending",
        "Northline Supply privacy request: Data access,Please send a copy of my order and profile data.",
        "Review the customer privacy request before changing records.",
        "demo-notification-cancellation-request,Customer message,Pending",
        "Northline Supply cancellation request: Changed mind,Please cancel this order before it ships.",
        "Review payment and fulfillment before cancelling this order.",
        "demo-notification-delivery-request,Customer message,Pending",
        "Northline Supply delivery request: Delivery instructions,Please leave the package with the front desk.",
        "Review delivery details before fulfillment work starts.",
        "demo-notification-fulfillment-failed,Fulfillment update,Failed,critical,ari@example.com,Ari Patel,Northline Supply shipment update,Tracking details could not be delivered.",
        "Retry delivery or contact the customer manually.",
        "/dashboard/stores/demo-store-outdoor/orders/demo-order-1002",
      ],
    },
    {
      label: "admin support queue csv export",
      path: "/dashboard/stores/demo-store-outdoor/activity/support/export",
      includes: [
        "ticket_id,type,priority,status,customer_name,customer_email,subject,detail,recommended_action,order_id,resource_id,age_days,href",
        "demo-return-request-1002,return,critical,Approved,Ari Patel,ari@example.com,Changed mind",
        "Resolve the approved return and issue the eligible refund.",
        "demo-review-1002-pack,review,critical,Pending,Ari Patel,ari@example.com,Field Carry Pack",
        "Moderate this review immediately to keep review publishing fresh.",
        "demo-notification-customer-message,notification,",
        "Pending,Mira Chen,mira@example.com,Northline Supply contact: Size question",
        "Reply to the customer or assign the message from the support queue.",
        "demo-notification-product-question,notification,",
        "Pending,Nina Brooks,nina@example.com,Northline Supply product question: Field Carry Pack / Compatibility",
        "Answer the product question before the customer leaves the product page.",
        "demo-notification-privacy-request,notification,",
        "Pending,Mira Chen,mira@example.com,Northline Supply privacy request: Data access",
        "Review the customer privacy request before changing records.",
        "demo-notification-cancellation-request,notification,",
        "Pending,Mira Chen,mira@example.com,Northline Supply cancellation request: Changed mind",
        "Review payment and fulfillment before cancelling this order.",
        "demo-notification-delivery-request,notification,",
        "Pending,Mira Chen,mira@example.com,Northline Supply delivery request: Delivery instructions",
        "Review delivery details before fulfillment work starts.",
        "/dashboard/stores/demo-store-outdoor/customers/privacy/export",
        "demo-notification-fulfillment-failed,notification,critical,Failed,Ari Patel,ari@example.com,Northline Supply shipment update,Tracking details could not be delivered.",
        "Retry delivery or contact the customer manually.",
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
      label: "admin checkout recovery campaign csv export",
      path: "/dashboard/stores/demo-store-outdoor/checkouts/recovery/export?q=bottle&status=open&sort=recovery_priority",
      includes: [
        "checkout_id,customer_name,customer_email,status,priority,stage,cadence,next_recovery_at,recommended_action",
        "demo-abandoned-checkout-1004",
        "Nina Brooks",
        "Second recovery",
        "Offer WELCOME10 or free shipping before manual outreach.",
      ],
    },
    {
      label: "admin promotions csv export",
      path: "/dashboard/stores/demo-store-outdoor/promotions/export",
      includes: [
        "section,metric,label,value,status,detail,href",
        "summary,active_discounts,Active discounts",
        "discount,demo-discount-welcome10,WELCOME10",
        "gift_card,demo-gift-card-north-2500",
      ],
    },
    {
      label: "admin discount performance csv export",
      path: "/dashboard/stores/demo-store-outdoor/promotions/performance/export",
      includes: [
        "row_type,code,status,value,configured_redemptions,observed_redemptions,utilization_rate,remaining_redemptions,gross_sales,discount_amount,net_sales,average_order_value,customer_count,recommended_action,detail,href",
        "discount,WELCOME10,Active,10% off",
        "discount_order,WELCOME10,Pending,Pending",
        "Campaign is active; monitor redemptions and order value.",
        "/dashboard/stores/demo-store-outdoor/orders/demo-order-1003",
      ],
    },
    {
      label: "admin gift card ledger csv export",
      path: "/dashboard/stores/demo-store-outdoor/gift-cards/export",
      includes: [
        "section,metric,gift_card_id,code,label,value,status,initial_balance,current_balance",
        "summary,active_balance,,",
        "gift_card,demo-gift-card-north-2500,demo-gift-card-north-2500,**** 2500",
        "redemption,demo-gift-card-redemption-1003,demo-gift-card-north-2500,**** 2500",
        "order_usage,demo-order-1003,demo-gift-card-north-2500,**** 2500",
      ],
    },
    {
      label: "admin returns csv export",
      path: "/dashboard/stores/demo-store-outdoor/returns/export",
      includes: [
        "section,metric,label,value,status,detail,href",
        "summary,return_requests,Return requests",
        "return_request,demo-return-request-1002",
        "refund,demo-refund-1002-1",
      ],
    },
    {
      label: "admin return sla csv export",
      path: "/dashboard/stores/demo-store-outdoor/returns/sla/export",
      includes: [
        "request_id,order_id,customer_name,customer_email,status,reason,sla_status,priority,requested_age_days,refundable_value,requested_at,updated_at,resolved_at,recommended_action,detail,href",
        "demo-return-request-1002,demo-order-1002,Ari Patel,ari@example.com,Approved,Changed mind,Resolution overdue,critical",
        "Resolve the approved return and issue the eligible refund.",
        "/dashboard/stores/demo-store-outdoor/orders/demo-order-1002",
      ],
    },
    {
      label: "admin reviews csv export",
      path: "/dashboard/stores/demo-store-outdoor/reviews/export",
      includes: [
        "section,metric,label,value,status,detail,href",
        "summary,total_reviews,Total reviews",
        "product_review,demo-review-1001-watch",
        "product_review,demo-review-1002-pack",
      ],
    },
    {
      label: "admin review moderation csv export",
      path: "/dashboard/stores/demo-store-outdoor/reviews/moderation/export",
      includes: [
        "review_id,product_id,product_name,customer_name,customer_email,rating,status,priority,age_days,moderation_status,recommended_action,title,body,merchant_reply,reviewed_at,updated_at,order_href,product_href",
        "demo-review-1002-pack,demo-product-carry-pack,Field Carry Pack,Ari Patel,ari@example.com,5,Pending,critical",
        "Moderate this review immediately to keep review publishing fresh.",
        "/dashboard/stores/demo-store-outdoor/orders/demo-order-1002",
      ],
    },
    {
      label: "admin orders csv export",
      path: "/dashboard/stores/demo-store-outdoor/orders/export?q=mira&financial=settled",
      includes: [
        "order_id,customer_name,customer_email",
        "financial_status,balance_due,ledger_delta",
        "demo-order-1001",
        "Mira Chen",
      ],
    },
    {
      label: "admin payments due csv export",
      path: "/dashboard/stores/demo-store-outdoor/orders/payments-due/export?payment=pending&financial=open_balance",
      includes: [
        "order_id,customer_name,customer_email,payment_status,financial_status,amount_due,age_days,priority,recommended_action",
        "demo-order-1003,Sam Rivera,sam@example.com,Pending,Open balance",
        "Send invoice reminder and hold fulfillment until payment is collected.",
        "/dashboard/stores/demo-store-outdoor/orders/demo-order-1003",
      ],
    },
    {
      label: "admin fulfillment queue csv export",
      path: "/dashboard/stores/demo-store-outdoor/orders/fulfillment/export?payment=paid&fulfillment=unfulfilled",
      includes: [
        "order_id,fulfillment_stage,fulfillment_detail,risk,payment_status",
        "demo-order-1001",
        "Paid order is ready for fulfillment.",
        "Field Carry Pack",
        "/dashboard/stores/demo-store-outdoor/orders/demo-order-1001/packing-slip",
      ],
    },
    {
      label: "admin pick list csv export",
      path: "/dashboard/stores/demo-store-outdoor/orders/pick-list/export?payment=paid&fulfillment=unfulfilled",
      includes: [
        "product_id,product_name,variant_id,variant_name,sku,total_quantity,order_count",
        "demo-product-carry-pack",
        "demo-variant-carry-pack-forest",
        "NLS-BAG-001-FOR",
        "demo-order-1001",
      ],
    },
    {
      label: "admin shipping manifest csv export",
      path: "/dashboard/stores/demo-store-outdoor/orders/shipping-manifest/export?payment=paid&fulfillment=unfulfilled",
      includes: [
        "order_id,manifest_status,carrier_action,fulfillment_stage,shipment_id,shipment_status,risk,payment_status",
        "demo-order-1001,Ready For Label,Create label and assign carrier before handoff.,Unfulfilled",
        "Mira Chen,mira@example.com",
        "Field Carry Pack",
        "/dashboard/stores/demo-store-outdoor/orders/demo-order-1001/packing-slip",
      ],
    },
    {
      label: "admin fulfillment sla csv export",
      path: "/dashboard/stores/demo-store-outdoor/orders/sla/export?payment=paid&fulfillment=unfulfilled",
      includes: [
        "order_id,sla_status,sla_hours,ship_clock_start_at,ship_deadline_at,hours_since_order,hours_to_ship,hours_overdue,recommended_action",
        "demo-order-1001,Late To Ship,48",
        "Prioritize packing and carrier label creation immediately.",
        "Mira Chen,mira@example.com",
        "/dashboard/stores/demo-store-outdoor/orders/demo-order-1001/packing-slip",
      ],
    },
    {
      label: "admin order risk csv export",
      path: "/dashboard/stores/demo-store-outdoor/orders/risk/export?risk=high",
      includes: [
        "order_id,customer_name,customer_email,risk_level,risk_score,critical_factors,warning_factors",
        "demo-order-1003",
        "Payment still open",
        "Hold fulfillment until the remaining payment is collected.",
      ],
    },
    {
      label: "admin order detail csv export",
      path: "/dashboard/stores/demo-store-outdoor/orders/demo-order-1001/export",
      includes: [
        "section,metric,label,value,status,detail,href",
        "summary,order_id,Order ID,demo-order-1001",
        "line_item,demo-order-item-1001-1,Trail Watch",
        "product_review,demo-review-1001-watch",
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
      label: "admin product variants csv export",
      path: "/dashboard/stores/demo-store-outdoor/products/variants/export?q=bottle&sort=inventory_asc",
      includes: [
        "product_id,product_name,product_status,product_health,product_category,product_sku,variant_id,option_name,option_value,variant_status,variant_sku",
        "demo-product-hydra-bottle",
        "demo-variant-hydra-bottle-steel",
        "NLS-BOT-003-STL",
      ],
    },
    {
      label: "admin product feed csv export",
      path: "/dashboard/stores/demo-store-outdoor/products/feed/export",
      includes: [
        "id,item_group_id,title,description,availability,condition,price,link,image_link,brand,google_product_category,product_type,mpn,sku",
        "demo-product-hydra-bottle:demo-variant-hydra-bottle-steel,demo-product-hydra-bottle,Hydra Bottle - Brushed steel",
        "42.00 USD",
        "Northline Supply,Drinkware,Drinkware,NLS-BOT-003-STL",
        "Ready for marketplace and channel sync.",
      ],
    },
    {
      label: "admin product import template csv export",
      path: "/dashboard/stores/demo-store-outdoor/products/import-template/export",
      includes: [
        "row_type,handle,title,status,sku,category,description,price,compare_at_price,inventory,image_url,option_name,option_value,variant_sku,variant_price,variant_compare_at_price,variant_inventory,variant_status,instructions",
        "product,field-carry-pack,Field Carry Pack,draft,NLS-BAG-001,Bags",
        "variant,field-carry-pack,,,,,,,,,,Color,Forest,NLS-BAG-001-FOR,129.00,159.00,14,active",
        "Delete note rows before uploading.",
      ],
    },
    {
      label: "admin product detail csv export",
      path: "/dashboard/stores/demo-store-outdoor/products/demo-product-hydra-bottle/export",
      includes: [
        "section,metric,label,value,status,detail,href",
        "summary,product_id,Product ID,demo-product-hydra-bottle",
        "summary,name,Name,Hydra Bottle",
        "variant,demo-variant-hydra-bottle-steel",
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
      label: "admin inventory reorder csv export",
      path: "/dashboard/stores/demo-store-outdoor/inventory/reorder/export?q=bottle&inventory=all&sort=reorder_desc",
      includes: [
        "product_id,name,sku,variant_skus,category,priority,reorder_quantity",
        "demo-product-hydra-bottle",
        "Hydra Bottle",
        "suggested_reorder_value",
      ],
    },
    {
      label: "admin inventory purchase order csv export",
      path: "/dashboard/stores/demo-store-outdoor/inventory/purchase-order/export?q=bottle&inventory=all&sort=reorder_desc",
      includes: [
        "po_number,supplier_name,product_id,product_name,sku,variant_skus,procurement_priority,order_quantity",
        "PO-NORTHLINE-SUPPLY-NLS-BOT-003,Drinkware supplier,demo-product-hydra-bottle,Hydra Bottle,NLS-BOT-003",
        "low_stock",
        "Restock sellable inventory to at least 12 units.",
        "/dashboard/stores/demo-store-outdoor/products/demo-product-hydra-bottle/edit",
      ],
    },
    {
      label: "admin inventory restock alerts csv export",
      path: "/dashboard/stores/demo-store-outdoor/inventory/restock-alerts/export",
      includes: [
        "recipient_email,recipient_name,product_id,product_name,sku,interest_source,marketing_eligible,priority,inventory_status",
        "nina@example.com,Nina Brooks,demo-product-hydra-bottle,Hydra Bottle,NLS-BOT-003,open_checkout | restock_profile,true,high,Low stock",
        "Send low-stock urgency or reserve-stock follow-up tied to the open cart.",
        "/dashboard/stores/demo-store-outdoor/products/demo-product-hydra-bottle/edit",
      ],
    },
    {
      label: "admin inventory valuation csv export",
      path: "/dashboard/stores/demo-store-outdoor/inventory/valuation/export",
      includes: [
        "row_type,product_id,product_name,product_status,product_sku,category,variant_id,variant_name,variant_status,variant_sku,inventory_count,unit_retail,retail_value,valuation_basis,risk,detail,href",
        "summary,,Inventory retail value",
        "product,demo-product-hydra-bottle,Hydra Bottle,Active,NLS-BOT-003,Drinkware",
        "variant,demo-product-hydra-bottle,Hydra Bottle,Active,NLS-BOT-003,Drinkware,demo-variant-hydra-bottle-steel,Color: Brushed steel,Active,NLS-BOT-003-STL",
        "active variant retail price",
      ],
    },
    {
      label: "admin inventory adjustment csv export",
      path: "/dashboard/stores/demo-store-outdoor/inventory/adjustments/export",
      includes: [
        "adjustment_id,product_id,product_name,variant_id,reason,delta",
        "demo-inventory-adjustment-1002,demo-product-hydra-bottle,Hydra Bottle,,Damage,-2",
        "Two bottles removed after inspection.",
      ],
    },
    {
      label: "admin customers csv export",
      path: "/dashboard/stores/demo-store-outdoor/customers/export?segment=vip&sort=risk_priority",
      includes: ["email,name,phone", "mira@example.com", "Mira Chen"],
    },
    {
      label: "admin customer segments csv export",
      path: "/dashboard/stores/demo-store-outdoor/customers/segments/export?segment=vip&sort=risk_priority",
      includes: [
        "segment,label,criteria,customers,primary_customers,marketing_opt_ins,campaign_eligible",
        "vip,VIP,VIP tag or high lifetime spend",
        "Mira Chen",
        "mira@example.com",
      ],
    },
    {
      label: "admin customer lifetime value csv export",
      path: "/dashboard/stores/demo-store-outdoor/customers/lifetime/export?segment=vip&sort=risk_priority",
      includes: [
        "email,name,primary_segment,lifetime_value,gross_spent,refunded,paid_orders,orders,average_order_value,refund_rate,days_since_last_order,retention_status,marketing_opt_in,tax_exempt,top_products,next_action,first_order_at,last_order_at,customer_href",
        "mira@example.com,Mira Chen,VIP",
        "Retain VIP",
        "Prioritize support and early access offers for this high-value customer.",
        "/dashboard/stores/demo-store-outdoor/customers/mira%40example.com",
      ],
    },
    {
      label: "admin customer retention csv export",
      path: "/dashboard/stores/demo-store-outdoor/customers/retention/export?segment=vip&sort=risk_priority",
      includes: [
        "email,name,primary_segment,retention_priority,campaign_type,marketing_eligible,consent_status",
        "mira@example.com,Mira Chen,VIP,high,loyalty,true,Marketing consent recorded",
        "Prioritize support and early access offers for this high-value customer.",
        "/dashboard/stores/demo-store-outdoor/customers/mira%40example.com",
      ],
    },
    {
      label: "admin customer privacy csv export",
      path: "/dashboard/stores/demo-store-outdoor/customers/privacy/export?segment=vip&sort=risk_priority",
      includes: [
        "email,name,profile_id,consent_status,accepts_marketing,tax_exempt,segment,data_scope,retention_status,recommended_action",
        "mira@example.com,Mira Chen,demo-customer-profile-mira,Marketing consent recorded,true,false,VIP",
        "profile | orders | shipping_address | merchant_note | customer_notes",
        "retain_order_records",
        "/dashboard/stores/demo-store-outdoor/customers/mira%40example.com/export",
      ],
    },
    {
      label: "admin customer detail csv export",
      path: "/dashboard/stores/demo-store-outdoor/customers/mira%40example.com/export",
      includes: [
        "section,metric,label,value,detail,href",
        "profile,email,Email,mira@example.com",
        "segment,primary_segment,Primary segment",
        "order_history,demo-order-1001",
      ],
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
