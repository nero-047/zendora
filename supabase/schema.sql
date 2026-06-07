create extension if not exists pgcrypto;

create table if not exists public.profiles (
  clerk_user_id text primary key,
  email text not null,
  name text not null,
  avatar_url text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null references public.profiles(clerk_user_id) on delete cascade,
  name text not null,
  slug text not null unique,
  description text,
  currency text not null default 'USD',
  theme_color text not null default '#0f766e',
  seo_title text,
  seo_description text,
  social_image_url text,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused')),
  shipping_rate_cents integer not null default 0 check (shipping_rate_cents >= 0),
  free_shipping_threshold_cents integer not null default 0 check (free_shipping_threshold_cents >= 0),
  tax_rate_bps integer not null default 0 check (tax_rate_bps >= 0 and tax_rate_bps <= 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.stores add column if not exists shipping_rate_cents integer not null default 0 check (shipping_rate_cents >= 0);
alter table public.stores add column if not exists free_shipping_threshold_cents integer not null default 0 check (free_shipping_threshold_cents >= 0);
alter table public.stores add column if not exists tax_rate_bps integer not null default 0 check (tax_rate_bps >= 0 and tax_rate_bps <= 10000);
alter table public.stores add column if not exists seo_title text;
alter table public.stores add column if not exists seo_description text;
alter table public.stores add column if not exists social_image_url text;

create table if not exists public.store_memberships (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  clerk_user_id text not null references public.profiles(clerk_user_id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'admin', 'staff')),
  created_at timestamptz not null default now(),
  unique (store_id, clerk_user_id)
);

create table if not exists public.store_invitations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  email text not null,
  role text not null default 'staff' check (role in ('admin', 'staff')),
  invited_by_user_id text not null references public.profiles(clerk_user_id) on delete restrict,
  accepted_at timestamptz,
  revoked_at timestamptz,
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists store_invitations_open_email_unique_idx
on public.store_invitations(store_id, lower(email))
where accepted_at is null and revoked_at is null;

create table if not exists public.store_audit_events (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  clerk_user_id text references public.profiles(clerk_user_id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id text,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.store_notifications (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  type text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'suppressed')),
  recipient_email text not null,
  recipient_name text,
  subject text not null,
  preview text not null,
  resource_type text not null,
  resource_id text,
  metadata jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.store_policies (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  type text not null check (type in ('refund', 'shipping', 'privacy', 'terms')),
  title text not null,
  body text,
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, type)
);

create table if not exists public.shipping_zones (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  countries text[] not null default '{}',
  rate_cents integer not null default 0 check (rate_cents >= 0),
  free_shipping_threshold_cents integer not null default 0 check (free_shipping_threshold_cents >= 0),
  status text not null default 'active' check (status in ('active', 'paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.shipping_zones add column if not exists countries text[] not null default '{}';
alter table public.shipping_zones add column if not exists rate_cents integer not null default 0 check (rate_cents >= 0);
alter table public.shipping_zones add column if not exists free_shipping_threshold_cents integer not null default 0 check (free_shipping_threshold_cents >= 0);
alter table public.shipping_zones add column if not exists status text not null default 'active' check (status in ('active', 'paused'));

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  slug text not null,
  sku text,
  category text,
  description text,
  price_cents integer not null check (price_cents >= 0),
  currency text not null default 'USD',
  inventory_count integer not null default 0 check (inventory_count >= 0),
  image_url text,
  image_path text,
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, slug)
);

alter table public.products add column if not exists sku text;
alter table public.products add column if not exists category text;

create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  title text not null,
  slug text not null,
  description text,
  image_url text,
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, slug)
);

alter table public.collections add column if not exists description text;
alter table public.collections add column if not exists image_url text;
alter table public.collections add column if not exists status text not null default 'draft' check (status in ('draft', 'active', 'archived'));
alter table public.collections add column if not exists sort_order integer not null default 0;

create table if not exists public.collection_products (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (collection_id, product_id)
);

alter table public.collection_products add column if not exists sort_order integer not null default 0;

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  option_name text not null default 'Variant',
  option_value text not null,
  sku text,
  price_cents integer not null check (price_cents >= 0),
  currency text not null default 'USD',
  inventory_count integer not null default 0 check (inventory_count >= 0),
  status text not null default 'active' check (status in ('active', 'paused')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, option_name, option_value)
);

alter table public.product_variants add column if not exists store_id uuid references public.stores(id) on delete cascade;
alter table public.product_variants add column if not exists product_id uuid references public.products(id) on delete cascade;
alter table public.product_variants add column if not exists option_name text not null default 'Variant';
alter table public.product_variants add column if not exists option_value text;
alter table public.product_variants add column if not exists sku text;
alter table public.product_variants add column if not exists price_cents integer not null default 0 check (price_cents >= 0);
alter table public.product_variants add column if not exists currency text not null default 'USD';
alter table public.product_variants add column if not exists inventory_count integer not null default 0 check (inventory_count >= 0);
alter table public.product_variants add column if not exists status text not null default 'active' check (status in ('active', 'paused'));
alter table public.product_variants add column if not exists sort_order integer not null default 0;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  customer_email text not null,
  customer_name text,
  customer_phone text,
  shipping_address_line1 text,
  shipping_address_line2 text,
  shipping_city text,
  shipping_region text,
  shipping_postal_code text,
  shipping_country text,
  customer_note text,
  status text not null default 'pending' check (status in ('pending', 'paid', 'fulfilled', 'cancelled')),
  order_source text not null default 'storefront' check (order_source in ('storefront', 'manual')),
  internal_note text,
  payment_status text not null default 'pending' check (payment_status in ('pending', 'authorized', 'paid', 'partially_refunded', 'refunded', 'voided')),
  payment_method text not null default 'manual_invoice',
  payment_provider text not null default 'manual',
  payment_reference text,
  customer_access_token text,
  subtotal_cents integer not null default 0 check (subtotal_cents >= 0),
  discount_code text,
  discount_cents integer not null default 0 check (discount_cents >= 0),
  shipping_cents integer not null default 0 check (shipping_cents >= 0),
  tax_cents integer not null default 0 check (tax_cents >= 0),
  tax_rate_bps integer not null default 0 check (tax_rate_bps >= 0 and tax_rate_bps <= 10000),
  total_cents integer not null default 0 check (total_cents >= 0),
  currency text not null default 'USD',
  paid_at timestamptz,
  fulfilled_at timestamptz,
  cancelled_at timestamptz,
  inventory_restocked_at timestamptz,
  tracking_carrier text,
  tracking_number text,
  tracking_url text,
  fulfillment_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders add column if not exists customer_phone text;
alter table public.orders add column if not exists shipping_address_line1 text;
alter table public.orders add column if not exists shipping_address_line2 text;
alter table public.orders add column if not exists shipping_city text;
alter table public.orders add column if not exists shipping_region text;
alter table public.orders add column if not exists shipping_postal_code text;
alter table public.orders add column if not exists shipping_country text;
alter table public.orders add column if not exists customer_note text;
alter table public.orders add column if not exists order_source text not null default 'storefront' check (order_source in ('storefront', 'manual'));
alter table public.orders add column if not exists internal_note text;
alter table public.orders add column if not exists payment_status text not null default 'pending' check (payment_status in ('pending', 'authorized', 'paid', 'partially_refunded', 'refunded', 'voided'));
alter table public.orders add column if not exists payment_method text not null default 'manual_invoice';
alter table public.orders add column if not exists payment_provider text not null default 'manual';
alter table public.orders add column if not exists payment_reference text;
alter table public.orders add column if not exists customer_access_token text;
alter table public.orders add column if not exists subtotal_cents integer not null default 0 check (subtotal_cents >= 0);
alter table public.orders add column if not exists discount_code text;
alter table public.orders add column if not exists discount_cents integer not null default 0 check (discount_cents >= 0);
alter table public.orders add column if not exists shipping_cents integer not null default 0 check (shipping_cents >= 0);
alter table public.orders add column if not exists tax_cents integer not null default 0 check (tax_cents >= 0);
alter table public.orders add column if not exists tax_rate_bps integer not null default 0 check (tax_rate_bps >= 0 and tax_rate_bps <= 10000);
alter table public.orders add column if not exists paid_at timestamptz;
alter table public.orders add column if not exists fulfilled_at timestamptz;
alter table public.orders add column if not exists cancelled_at timestamptz;
alter table public.orders add column if not exists inventory_restocked_at timestamptz;
alter table public.orders add column if not exists tracking_carrier text;
alter table public.orders add column if not exists tracking_number text;
alter table public.orders add column if not exists tracking_url text;
alter table public.orders add column if not exists fulfillment_note text;

create table if not exists public.abandoned_checkouts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  customer_email text not null,
  customer_name text,
  recovery_token text not null,
  status text not null default 'open' check (status in ('open', 'recovered', 'dismissed')),
  cart jsonb not null default '[]'::jsonb,
  subtotal_cents integer not null default 0 check (subtotal_cents >= 0),
  currency text not null default 'USD',
  last_seen_at timestamptz not null default now(),
  recovery_email_sent_at timestamptz,
  recovery_email_count integer not null default 0 check (recovery_email_count >= 0),
  recovered_order_id uuid references public.orders(id) on delete set null,
  recovered_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, recovery_token)
);

alter table public.abandoned_checkouts add column if not exists customer_name text;
alter table public.abandoned_checkouts add column if not exists recovery_token text not null default encode(gen_random_bytes(24), 'hex');
alter table public.abandoned_checkouts add column if not exists status text not null default 'open' check (status in ('open', 'recovered', 'dismissed'));
alter table public.abandoned_checkouts add column if not exists cart jsonb not null default '[]'::jsonb;
alter table public.abandoned_checkouts add column if not exists subtotal_cents integer not null default 0 check (subtotal_cents >= 0);
alter table public.abandoned_checkouts add column if not exists currency text not null default 'USD';
alter table public.abandoned_checkouts add column if not exists last_seen_at timestamptz not null default now();
alter table public.abandoned_checkouts add column if not exists recovery_email_sent_at timestamptz;
alter table public.abandoned_checkouts add column if not exists recovery_email_count integer not null default 0 check (recovery_email_count >= 0);
alter table public.abandoned_checkouts add column if not exists recovered_order_id uuid references public.orders(id) on delete set null;
alter table public.abandoned_checkouts add column if not exists recovered_at timestamptz;
alter table public.abandoned_checkouts add column if not exists dismissed_at timestamptz;

create table if not exists public.discount_codes (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  code text not null,
  type text not null check (type in ('percent', 'fixed')),
  value integer not null check (value > 0),
  min_subtotal_cents integer not null default 0 check (min_subtotal_cents >= 0),
  usage_limit integer check (usage_limit is null or usage_limit > 0),
  redemption_count integer not null default 0 check (redemption_count >= 0),
  status text not null default 'active' check (status in ('active', 'paused')),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, code)
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_variant_id uuid references public.product_variants(id) on delete set null,
  product_name text not null,
  variant_name text,
  variant_sku text,
  unit_price_cents integer not null check (unit_price_cents >= 0),
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now()
);

alter table public.order_items add column if not exists product_variant_id uuid references public.product_variants(id) on delete set null;
alter table public.order_items add column if not exists variant_name text;
alter table public.order_items add column if not exists variant_sku text;

create table if not exists public.order_refunds (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  clerk_user_id text not null references public.profiles(clerk_user_id) on delete restrict,
  amount_cents integer not null check (amount_cents > 0),
  reason text not null default 'other' check (reason in ('customer_request', 'damaged', 'fraud', 'other')),
  note text,
  restocked_inventory boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.order_refunds add column if not exists note text;
alter table public.order_refunds add column if not exists restocked_inventory boolean not null default false;

create table if not exists public.order_return_requests (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  customer_email text not null,
  status text not null default 'requested' check (status in ('requested', 'approved', 'rejected', 'resolved')),
  reason text not null default 'other' check (reason in ('changed_mind', 'damaged', 'wrong_item', 'quality', 'other')),
  note text,
  merchant_note text,
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.order_return_requests add column if not exists customer_email text;
alter table public.order_return_requests add column if not exists status text not null default 'requested' check (status in ('requested', 'approved', 'rejected', 'resolved'));
alter table public.order_return_requests add column if not exists reason text not null default 'other' check (reason in ('changed_mind', 'damaged', 'wrong_item', 'quality', 'other'));
alter table public.order_return_requests add column if not exists note text;
alter table public.order_return_requests add column if not exists merchant_note text;
alter table public.order_return_requests add column if not exists requested_at timestamptz not null default now();
alter table public.order_return_requests add column if not exists resolved_at timestamptz;

create table if not exists public.order_payment_transactions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  clerk_user_id text references public.profiles(clerk_user_id) on delete set null,
  type text not null check (type in ('authorization', 'capture', 'refund', 'void')),
  status text not null default 'succeeded' check (status in ('pending', 'succeeded', 'failed')),
  payment_method text not null default 'manual_invoice',
  payment_provider text not null default 'manual',
  provider_reference text,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'USD',
  processed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.order_payment_transactions add column if not exists clerk_user_id text references public.profiles(clerk_user_id) on delete set null;
alter table public.order_payment_transactions add column if not exists payment_method text not null default 'manual_invoice';
alter table public.order_payment_transactions add column if not exists payment_provider text not null default 'manual';
alter table public.order_payment_transactions add column if not exists provider_reference text;
alter table public.order_payment_transactions add column if not exists processed_at timestamptz;
alter table public.order_payment_transactions add column if not exists metadata jsonb not null default '{}'::jsonb;

create table if not exists public.inventory_adjustments (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  product_variant_id uuid references public.product_variants(id) on delete set null,
  clerk_user_id text not null references public.profiles(clerk_user_id) on delete restrict,
  reason text not null check (reason in ('restock', 'correction', 'damage', 'return', 'manual_edit')),
  reference text,
  note text,
  delta integer not null check (delta <> 0),
  previous_inventory integer not null check (previous_inventory >= 0),
  next_inventory integer not null check (next_inventory >= 0),
  created_at timestamptz not null default now()
);

alter table public.inventory_adjustments add column if not exists product_variant_id uuid references public.product_variants(id) on delete set null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists stores_set_updated_at on public.stores;
create trigger stores_set_updated_at
before update on public.stores
for each row execute function public.set_updated_at();

drop trigger if exists store_invitations_set_updated_at on public.store_invitations;
create trigger store_invitations_set_updated_at
before update on public.store_invitations
for each row execute function public.set_updated_at();

drop trigger if exists store_notifications_set_updated_at on public.store_notifications;
create trigger store_notifications_set_updated_at
before update on public.store_notifications
for each row execute function public.set_updated_at();

drop trigger if exists store_policies_set_updated_at on public.store_policies;
create trigger store_policies_set_updated_at
before update on public.store_policies
for each row execute function public.set_updated_at();

drop trigger if exists shipping_zones_set_updated_at on public.shipping_zones;
create trigger shipping_zones_set_updated_at
before update on public.shipping_zones
for each row execute function public.set_updated_at();

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
before update on public.products
for each row execute function public.set_updated_at();

drop trigger if exists collections_set_updated_at on public.collections;
create trigger collections_set_updated_at
before update on public.collections
for each row execute function public.set_updated_at();

drop trigger if exists product_variants_set_updated_at on public.product_variants;
create trigger product_variants_set_updated_at
before update on public.product_variants
for each row execute function public.set_updated_at();

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

drop trigger if exists abandoned_checkouts_set_updated_at on public.abandoned_checkouts;
create trigger abandoned_checkouts_set_updated_at
before update on public.abandoned_checkouts
for each row execute function public.set_updated_at();

drop trigger if exists order_return_requests_set_updated_at on public.order_return_requests;
create trigger order_return_requests_set_updated_at
before update on public.order_return_requests
for each row execute function public.set_updated_at();

drop trigger if exists discount_codes_set_updated_at on public.discount_codes;
create trigger discount_codes_set_updated_at
before update on public.discount_codes
for each row execute function public.set_updated_at();

create index if not exists stores_owner_id_idx on public.stores(owner_id);
create index if not exists store_memberships_clerk_user_id_idx on public.store_memberships(clerk_user_id);
create index if not exists store_invitations_store_id_created_at_idx
on public.store_invitations(store_id, created_at desc);
create index if not exists store_invitations_email_open_idx
on public.store_invitations(lower(email))
where accepted_at is null and revoked_at is null;
create index if not exists store_audit_events_store_id_created_at_idx
on public.store_audit_events(store_id, created_at desc);
create index if not exists store_audit_events_clerk_user_id_idx
on public.store_audit_events(clerk_user_id);
create index if not exists store_notifications_store_id_created_at_idx
on public.store_notifications(store_id, created_at desc);
create index if not exists store_notifications_status_created_at_idx
on public.store_notifications(status, created_at asc);
create index if not exists store_notifications_recipient_email_idx
on public.store_notifications(lower(recipient_email));
create index if not exists store_policies_store_id_status_idx
on public.store_policies(store_id, status);
create index if not exists shipping_zones_store_id_status_idx on public.shipping_zones(store_id, status);
create index if not exists products_store_id_status_idx on public.products(store_id, status);
create index if not exists products_store_id_category_idx on public.products(store_id, category);
create unique index if not exists products_store_id_sku_unique_idx
on public.products(store_id, sku)
where sku is not null and sku <> '';
create index if not exists collections_store_id_status_idx on public.collections(store_id, status);
create index if not exists collections_store_id_sort_order_idx on public.collections(store_id, sort_order);
create index if not exists collection_products_collection_id_sort_order_idx on public.collection_products(collection_id, sort_order);
create index if not exists collection_products_product_id_idx on public.collection_products(product_id);
create index if not exists product_variants_store_id_product_id_idx on public.product_variants(store_id, product_id);
create index if not exists product_variants_product_id_status_idx on public.product_variants(product_id, status);
create unique index if not exists product_variants_store_id_sku_unique_idx
on public.product_variants(store_id, sku)
where sku is not null and sku <> '';
create index if not exists orders_store_id_created_at_idx on public.orders(store_id, created_at desc);
create index if not exists orders_store_id_paid_at_idx on public.orders(store_id, paid_at desc);
create index if not exists orders_store_id_status_idx on public.orders(store_id, status);
create index if not exists orders_store_id_order_source_idx on public.orders(store_id, order_source);
create index if not exists orders_store_id_payment_status_idx on public.orders(store_id, payment_status);
create index if not exists orders_customer_email_idx on public.orders(customer_email);
create unique index if not exists orders_customer_access_token_unique_idx
on public.orders(customer_access_token)
where customer_access_token is not null and customer_access_token <> '';
create index if not exists abandoned_checkouts_store_id_last_seen_idx
on public.abandoned_checkouts(store_id, last_seen_at desc);
create index if not exists abandoned_checkouts_store_id_status_idx
on public.abandoned_checkouts(store_id, status, last_seen_at desc);
create unique index if not exists abandoned_checkouts_store_recovery_token_unique_idx
on public.abandoned_checkouts(store_id, recovery_token)
where recovery_token <> '';
create index if not exists abandoned_checkouts_customer_email_idx
on public.abandoned_checkouts(lower(customer_email));
create index if not exists order_items_order_id_idx on public.order_items(order_id);
create index if not exists order_items_product_variant_id_idx on public.order_items(product_variant_id);
create index if not exists order_refunds_store_id_created_at_idx on public.order_refunds(store_id, created_at desc);
create index if not exists order_refunds_order_id_created_at_idx on public.order_refunds(order_id, created_at desc);
create index if not exists order_return_requests_store_id_status_idx
on public.order_return_requests(store_id, status, created_at desc);
create index if not exists order_return_requests_order_id_created_at_idx
on public.order_return_requests(order_id, created_at desc);
create index if not exists order_payment_transactions_store_id_created_at_idx
on public.order_payment_transactions(store_id, created_at desc);
create index if not exists order_payment_transactions_order_id_created_at_idx
on public.order_payment_transactions(order_id, created_at desc);
create unique index if not exists order_payment_transactions_provider_reference_unique_idx
on public.order_payment_transactions(store_id, payment_provider, provider_reference)
where provider_reference is not null and provider_reference <> '';
create index if not exists discount_codes_store_id_status_idx on public.discount_codes(store_id, status);
create index if not exists discount_codes_store_id_code_idx on public.discount_codes(store_id, code);
create index if not exists inventory_adjustments_store_id_created_at_idx
on public.inventory_adjustments(store_id, created_at desc);
create index if not exists inventory_adjustments_product_id_created_at_idx
on public.inventory_adjustments(product_id, created_at desc);
create index if not exists inventory_adjustments_product_variant_id_created_at_idx
on public.inventory_adjustments(product_variant_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.stores enable row level security;
alter table public.store_memberships enable row level security;
alter table public.store_invitations enable row level security;
alter table public.store_audit_events enable row level security;
alter table public.store_notifications enable row level security;
alter table public.store_policies enable row level security;
alter table public.shipping_zones enable row level security;
alter table public.products enable row level security;
alter table public.collections enable row level security;
alter table public.collection_products enable row level security;
alter table public.product_variants enable row level security;
alter table public.orders enable row level security;
alter table public.abandoned_checkouts enable row level security;
alter table public.order_items enable row level security;
alter table public.order_refunds enable row level security;
alter table public.order_return_requests enable row level security;
alter table public.order_payment_transactions enable row level security;
alter table public.discount_codes enable row level security;
alter table public.inventory_adjustments enable row level security;

drop policy if exists "public active store reads" on public.stores;
create policy "public active store reads"
on public.stores for select
using (status = 'active');

drop policy if exists "public active shipping zone reads" on public.shipping_zones;
create policy "public active shipping zone reads"
on public.shipping_zones for select
using (
  status = 'active'
  and exists (
    select 1 from public.stores
    where stores.id = shipping_zones.store_id
    and stores.status = 'active'
  )
);

drop policy if exists "public published policy reads" on public.store_policies;
create policy "public published policy reads"
on public.store_policies for select
using (
  status = 'published'
  and exists (
    select 1 from public.stores
    where stores.id = store_policies.store_id
    and stores.status = 'active'
  )
);

drop policy if exists "public active product reads" on public.products;
create policy "public active product reads"
on public.products for select
using (
  status = 'active'
  and exists (
    select 1 from public.stores
    where stores.id = products.store_id
    and stores.status = 'active'
  )
);

drop policy if exists "public active collection reads" on public.collections;
create policy "public active collection reads"
on public.collections for select
using (
  status = 'active'
  and exists (
    select 1 from public.stores
    where stores.id = collections.store_id
    and stores.status = 'active'
  )
);

drop policy if exists "public active collection product reads" on public.collection_products;
create policy "public active collection product reads"
on public.collection_products for select
using (
  exists (
    select 1 from public.collections
    join public.stores on stores.id = collections.store_id
    where collections.id = collection_products.collection_id
    and collections.status = 'active'
    and stores.status = 'active'
  )
);

drop policy if exists "public active product variant reads" on public.product_variants;
create policy "public active product variant reads"
on public.product_variants for select
using (
  status = 'active'
  and exists (
    select 1 from public.products
    join public.stores on stores.id = products.store_id
    where products.id = product_variants.product_id
    and products.status = 'active'
    and stores.status = 'active'
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public product image reads" on storage.objects;
create policy "public product image reads"
on storage.objects for select
using (bucket_id = 'product-images');

-- Server mutations use SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY
-- from Next.js Server Functions.
-- If you later expose client-side Supabase writes, add Clerk JWT templates and RLS
-- policies that compare auth.jwt()->>'sub' against clerk_user_id.
