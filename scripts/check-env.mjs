import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const args = new Set(process.argv.slice(2));
const strict = args.has("--strict") || args.has("--production");

function loadDotEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");

  if (!existsSync(envPath)) {
    return;
  }

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, "");

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function present(key) {
  const value = process.env[key];

  return Boolean(value && value.trim() && !value.includes("your_"));
}

function oneOf(keys) {
  return keys.some((key) => present(key));
}

function anyOf(keys) {
  return keys.some((key) => Boolean(process.env[key]?.trim()));
}

loadDotEnvLocal();

const checks = [
  {
    name: "NEXT_PUBLIC_APP_URL",
    ok: present("NEXT_PUBLIC_APP_URL"),
    hint: "Use http://localhost:3000 locally and your EB/custom HTTPS URL in production.",
  },
  {
    name: "NEXT_PUBLIC_SUPABASE_URL",
    ok: present("NEXT_PUBLIC_SUPABASE_URL"),
    hint: "Supabase Dashboard -> Project Settings -> API -> Project URL.",
  },
  {
    name: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ok: oneOf([
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ]),
    hint: "Supabase Dashboard -> Project Settings -> API keys -> publishable/anon key.",
  },
  {
    name: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    ok: present("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"),
    hint: "Clerk Dashboard -> API Keys -> Publishable key.",
  },
  {
    name: "CLERK_SECRET_KEY",
    ok: present("CLERK_SECRET_KEY"),
    hint: "Clerk Dashboard -> API Keys -> Secret key.",
  },
];

if (strict) {
  const s3Keys = [
    "SUPABASE_STORAGE_S3_ACCESS_KEY_ID",
    "SUPABASE_STORAGE_S3_SECRET_ACCESS_KEY",
    "SUPABASE_STORAGE_S3_REGION",
  ];

  checks.push(
    {
      name: "SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY",
      ok: oneOf(["SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"]),
      hint: "Supabase Dashboard -> Project Settings -> API keys -> secret key, or legacy service_role key. Server-only.",
    },
    {
      name: "CLERK_WEBHOOK_SIGNING_SECRET",
      ok: present("CLERK_WEBHOOK_SIGNING_SECRET"),
      hint: "Clerk Dashboard -> Webhooks -> endpoint -> Signing secret.",
    },
    {
      name: "SUPABASE_PRODUCT_IMAGE_BUCKET",
      ok: present("SUPABASE_PRODUCT_IMAGE_BUCKET"),
      hint: "Use product-images unless you changed the bucket name in supabase/schema.sql.",
    },
  );

  if (anyOf(s3Keys) || present("SUPABASE_STORAGE_S3_ENDPOINT")) {
    checks.push(
      {
        name: "SUPABASE_STORAGE_S3_ACCESS_KEY_ID",
        ok: present("SUPABASE_STORAGE_S3_ACCESS_KEY_ID"),
        hint: "Supabase Storage -> Settings -> S3 access keys -> Access Key ID.",
      },
      {
        name: "SUPABASE_STORAGE_S3_SECRET_ACCESS_KEY",
        ok: present("SUPABASE_STORAGE_S3_SECRET_ACCESS_KEY"),
        hint: "Supabase Storage -> Settings -> S3 access keys -> Secret Access Key. Server-only.",
      },
      {
        name: "SUPABASE_STORAGE_S3_REGION",
        ok: present("SUPABASE_STORAGE_S3_REGION"),
        hint: "Supabase Storage -> Settings -> S3 configuration -> Region.",
      },
    );
  }
}

const missing = checks.filter((check) => !check.ok);

if (missing.length === 0) {
  console.log(
    strict
      ? "Strict integration environment check passed."
      : "Base environment check passed.",
  );
  process.exit(0);
}

console.error(
  strict
    ? "Strict integration environment check failed. Missing:"
    : "Base environment check failed. Missing:",
);

for (const check of missing) {
  console.error(`- ${check.name}: ${check.hint}`);
}

process.exit(1);
