# AWS Elastic Beanstalk Deployment

Zendora is prepared for the Elastic Beanstalk Node.js platform.

## Platform

Use this platform branch:

- Node.js 24 running on Amazon Linux 2023

The app includes:

- `Buildfile` to run `npm run build`
- `Procfile` to run `npm run start:eb`
- `.ebextensions/01_environment.config` for production runtime defaults
- `.platform/nginx/conf.d/10_uploads.conf` for 10 MB product image uploads
- `/api/health` for a simple health endpoint
- `/api/readiness` for production configuration and Supabase/Clerk readiness
- `npm run check:deploy` to validate required production environment variables
- `npm run package:eb` to create `dist/zendora-eb-source.zip`

## Environment Properties

Set these in Elastic Beanstalk console under:

`Configuration` -> `Updates, monitoring, and logging` / `Environment properties`

```env
NEXT_PUBLIC_APP_URL=https://your-eb-or-custom-domain

NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_PRODUCT_IMAGE_BUCKET=product-images
SUPABASE_STORAGE_S3_ACCESS_KEY_ID=
SUPABASE_STORAGE_S3_SECRET_ACCESS_KEY=
SUPABASE_STORAGE_S3_REGION=
SUPABASE_STORAGE_S3_ENDPOINT=

NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SIGNING_SECRET=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard
```

You can use `docs/deployment/elastic-beanstalk.env.example` as a copy/paste
template for Elastic Beanstalk environment properties.

Do not commit production secrets. Keep them in Elastic Beanstalk environment
properties, AWS Secrets Manager, or your deployment pipeline.

Before deploying, run:

```bash
npm run check:deploy
```

This checks for all runtime credentials needed for production persistence,
storage uploads, and Clerk webhook sync.

## Supabase Setup

1. Open your Supabase project.
2. Run `supabase/schema.sql` in the SQL Editor.
3. Confirm the `product-images` bucket exists in Storage and is public.
4. Copy the project URL, publishable key, and service role key into EB
   environment properties.

The S3-compatible storage access keys from Supabase are not used by the current
code path unless you set the optional `SUPABASE_STORAGE_S3_*` variables. Without
S3 variables, Zendora uploads product images through the Supabase Storage API
with `SUPABASE_SERVICE_ROLE_KEY`.

If using the optional S3 upload provider:

1. In Supabase, enable S3 protocol for Storage.
2. Generate server-side S3 access keys.
3. Copy the access key ID, secret access key, and region into EB environment
   properties.
4. `SUPABASE_STORAGE_S3_ENDPOINT` is optional. By default Zendora derives:

```txt
https://<project-ref>.storage.supabase.co/storage/v1/s3
```

These S3 keys are server-only and bypass RLS. Never expose them as
`NEXT_PUBLIC_*`.

## Clerk Setup

1. Add the Clerk publishable key and secret key to EB environment properties.
2. Create a Clerk webhook endpoint:

```txt
https://your-eb-or-custom-domain/api/webhooks/clerk
```

3. Subscribe to:

- `user.created`
- `user.updated`
- `user.deleted`

4. Add the endpoint signing secret to `CLERK_WEBHOOK_SIGNING_SECRET`.
5. In Clerk allowed origins/redirects, include your EB/custom domain and the
   local URL if you are testing locally.

## Deployment Commands

With EB CLI:

```bash
eb init
eb create zendora-prod
eb setenv KEY=value KEY2=value2
npm run check:deploy
npm run package:eb
eb deploy
```

Or upload a source bundle from the AWS console. Make sure the zip is created
from the project root so `package.json`, `Buildfile`, and `Procfile` are at the
top level.

If you use the console upload flow, upload:

```txt
dist/zendora-eb-source.zip
```

## Health Check

Use this path for load balancer/application health checks:

```txt
/api/health
```

Use this path manually after deployment to verify production readiness:

```txt
/api/readiness
```

`/api/readiness` returns `503` until all production credentials are present and
the Supabase schema plus `product-images` bucket are reachable. This is useful
for deployment debugging, but `/api/health` is better for the load balancer
because it confirms the Next.js process is alive without depending on external
services.
