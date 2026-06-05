# Zendora

Zendora is a Shopify-style MVP built as a personal portfolio project. It shows
the core system thinking behind a multi-store commerce dashboard: Clerk auth,
Supabase database/storage, Clerk webhooks for profile sync, product image
uploads, public storefronts, and AWS Elastic Beanstalk deployment packaging.

The app is intentionally demo-friendly. It can run with mock commerce data while
server-only Supabase credentials are missing, then switch to real persistence
when the strict integration env values are added.

## Getting Started

Install dependencies and create your local env file:

```bash
npm install
cp .env.example .env.local
npm run check:deploy
```

Then run the app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Integration Checks

```bash
npm run check:deploy
npm run check:integrations
```

`check:deploy` verifies the base demo deploy env. `check:integrations` verifies
the full Supabase server key, storage bucket, and Clerk webhook configuration.

Credential setup is documented in
[docs/setup/credentials.md](docs/setup/credentials.md).

## AWS Elastic Beanstalk

Zendora includes a `Buildfile`, `Procfile`, EB environment config, health check,
and a source-bundle script:

```bash
npm run build
npm run package:eb
```

Upload `dist/zendora-eb-source.zip` or deploy with the EB CLI. Full instructions
are in [docs/deployment/aws-elastic-beanstalk.md](docs/deployment/aws-elastic-beanstalk.md).

## Verification

```bash
npm run lint
npm run build
npm audit --audit-level=moderate
npm run smoke
```
