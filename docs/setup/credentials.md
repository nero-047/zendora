# Supabase and Clerk Credentials

Zendora can run as a portfolio demo with only the base public/auth credentials.
Full persistence, product image uploads, and webhook-backed profile sync need the
server-only values too.

Do not commit real secrets. Put local values in `.env.local` and deployment
values in Elastic Beanstalk environment properties.

## Local Setup

```bash
cp .env.example .env.local
npm run check:deploy
```

Use `npm run check:integrations` only when you want the strict Supabase database,
storage, and Clerk webhook path to be fully wired.

## Supabase

Open your Supabase project dashboard.

1. Project URL:
   - Copy the project URL from the project Connect dialog or API settings.
   - Paste it as `NEXT_PUBLIC_SUPABASE_URL`.
2. Publishable key:
   - Copy the `sb_publishable_...` key from API keys.
   - Paste it as `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
   - If your project still shows a legacy anon key, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
     is also supported.
3. Server key for database writes:
   - Prefer a server-side `sb_secret_...` key when available.
   - Paste it as `SUPABASE_SECRET_KEY`.
   - A legacy `service_role` key also works as `SUPABASE_SERVICE_ROLE_KEY`.
   - Keep this server-only; it bypasses row-level security.
4. Schema and bucket:
   - Run `supabase/schema.sql` in the SQL Editor.
   - Confirm the `product-images` bucket exists and is public.
5. Optional S3 upload provider:
   - In Storage S3 settings, generate an access key pair.
   - Copy the access key ID, secret access key, endpoint, and region.
   - Paste them into the `SUPABASE_STORAGE_S3_*` variables.
   - These keys are server-only and bypass RLS.

Zendora can upload product images through the normal Supabase Storage API when
`SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` is set. The S3 variables are
optional. The S3 access key ID and secret are not enough by themselves; Supabase
also requires the region from the Storage S3 configuration page.

## Clerk

Open your Clerk application dashboard.

1. API keys:
   - Copy the publishable key to `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`.
   - Copy the secret key to `CLERK_SECRET_KEY`.
2. Redirect URLs:
   - Keep `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`.
   - Keep `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up`.
   - Keep the fallback redirects pointed at `/dashboard`.
   - Keep `CLERK_TELEMETRY_DISABLED=1` for quieter demo/deploy logs.
3. Webhook:
   - Create an endpoint at `/api/webhooks/clerk`.
   - For EB, use `https://your-eb-or-custom-domain/api/webhooks/clerk`.
   - Subscribe to `user.created`, `user.updated`, and `user.deleted`.
   - Copy the endpoint signing secret to `CLERK_WEBHOOK_SIGNING_SECRET`.

For a portfolio demo, missing strict integration values make `/api/readiness`
return `503`, but `/api/health`, the landing page, and the demo dashboard can
still work.

## Official References

- Supabase API keys: https://supabase.com/docs/guides/getting-started/api-keys
- Supabase Storage S3 authentication:
  https://supabase.com/docs/guides/storage/s3/authentication/
- Clerk environment variables:
  https://clerk.com/docs/deployments/clerk-environment-variables/
- Clerk webhooks:
  https://clerk.com/docs/guides/development/webhooks/overview
