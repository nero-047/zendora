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

async function run() {
  const checks = [];

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
  checks.push("home");

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

  const storefrontChecks = [
    {
      label: "storefront",
      path: "/stores/northline-supply",
      includes: ["Northline Supply", "Field Carry Pack", "Checkout"],
    },
    {
      label: "product",
      path: "/stores/northline-supply/products/field-carry-pack",
      includes: ["Field Carry Pack", "Weather-resistant", "Add to cart"],
    },
    {
      label: "collection",
      path: "/stores/northline-supply/collections/everyday-carry",
      includes: ["Everyday Carry", "Field Carry Pack"],
    },
    {
      label: "checkout",
      path: "/stores/northline-supply/checkout",
      includes: ["Checkout", "Customer", "Delivery"],
    },
    {
      label: "order receipt",
      path: "/stores/northline-supply/orders/demo-order-1001?token=demo-token-1001",
      includes: ["Order received", "Payment summary", "Request return"],
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
    const result = await request(check.path);
    assert(
      result.response.status === 200,
      `${check.path} did not return 200. Status: ${result.response.status}`,
    );
    assert(
      typeof result.body === "string",
      `${check.path} did not return an HTML response.`,
    );

    for (const expectedText of check.includes) {
      assert(
        result.body.includes(expectedText),
        `${check.path} did not render expected text: ${expectedText}`,
      );
    }

    checks.push(check.label);
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
