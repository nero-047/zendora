export function getAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

export function isClerkConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY,
  );
}

export function isClerkWebhookConfigured() {
  return Boolean(process.env.CLERK_WEBHOOK_SIGNING_SECRET);
}

export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serverKey =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serverKey) {
    return null;
  }

  return { url, serverKey };
}

export function getSupabasePublicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !publishableKey) {
    return null;
  }

  return { url, publishableKey };
}

export function isSupabasePublicConfigured() {
  return Boolean(getSupabasePublicConfig());
}

export function isSupabaseConfigured() {
  return Boolean(getSupabaseConfig());
}

export function getSupabaseProjectRef() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!url) {
    return null;
  }

  try {
    const hostname = new URL(url).hostname;
    const [projectRef] = hostname.split(".");

    return projectRef || null;
  } catch {
    return null;
  }
}

export function getSupabaseStorageS3Config() {
  const accessKeyId = process.env.SUPABASE_STORAGE_S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.SUPABASE_STORAGE_S3_SECRET_ACCESS_KEY;
  const region = process.env.SUPABASE_STORAGE_S3_REGION;
  const configuredEndpoint = process.env.SUPABASE_STORAGE_S3_ENDPOINT;
  const projectRef = getSupabaseProjectRef();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!accessKeyId || !secretAccessKey || !region) {
    return null;
  }

  const endpoint =
    configuredEndpoint ||
    (projectRef
      ? `https://${projectRef}.storage.supabase.co/storage/v1/s3`
      : supabaseUrl
        ? `${supabaseUrl.replace(/\/$/, "")}/storage/v1/s3`
        : null);

  if (!endpoint) {
    return null;
  }

  return {
    endpoint,
    region,
    accessKeyId,
    secretAccessKey,
  };
}

export function isSupabaseStorageS3Configured() {
  return Boolean(getSupabaseStorageS3Config());
}

export const productImageBucket =
  process.env.SUPABASE_PRODUCT_IMAGE_BUCKET || "product-images";
