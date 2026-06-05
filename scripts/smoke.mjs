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
