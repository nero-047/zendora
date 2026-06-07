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

create table if not exists public.store_pages (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  title text not null,
  slug text not null,
  body text not null default '',
  seo_title text,
  seo_description text,
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, slug)
);

alter table public.store_pages add column if not exists body text not null default '';
alter table public.store_pages add column if not exists seo_title text;
alter table public.store_pages add column if not exists seo_description text;
alter table public.store_pages add column if not exists status text not null default 'draft' check (status in ('draft', 'published'));
alter table public.store_pages add column if not exists published_at timestamptz;

update public.store_policies
set published_at = created_at
where status = 'published' and published_at is null;

update public.store_policies
set published_at = null
where status = 'draft' and published_at is not null;

update public.store_pages
set published_at = created_at
where status = 'published' and published_at is null;

update public.store_pages
set published_at = null
where status = 'draft' and published_at is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'store_policies_published_timestamp_check'
  ) then
    alter table public.store_policies
    add constraint store_policies_published_timestamp_check
    check (
      (status = 'published' and published_at is not null) or
      (status = 'draft' and published_at is null)
    );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'store_pages_published_timestamp_check'
  ) then
    alter table public.store_pages
    add constraint store_pages_published_timestamp_check
    check (
      (status = 'published' and published_at is not null) or
      (status = 'draft' and published_at is null)
    );
  end if;
end
$$;

create table if not exists public.store_navigation_menus (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  location text not null check (location in ('header', 'footer')),
  links jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, location)
);

alter table public.store_navigation_menus add column if not exists links jsonb not null default '[]'::jsonb;

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

update public.products
set price_cents = 0
where price_cents < 0;

update public.products
set inventory_count = 0
where inventory_count < 0;

update public.collections
set sort_order = 0
where sort_order < 0;

update public.collection_products
set sort_order = 0
where sort_order < 0;

update public.product_variants
set price_cents = 0
where price_cents < 0;

update public.product_variants
set inventory_count = 0
where inventory_count < 0;

update public.product_variants
set sort_order = 0
where sort_order < 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'products_price_nonnegative_check'
  ) then
    alter table public.products
    add constraint products_price_nonnegative_check
    check (price_cents >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'products_inventory_nonnegative_check'
  ) then
    alter table public.products
    add constraint products_inventory_nonnegative_check
    check (inventory_count >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'collections_sort_order_nonnegative_check'
  ) then
    alter table public.collections
    add constraint collections_sort_order_nonnegative_check
    check (sort_order >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'collection_products_sort_order_nonnegative_check'
  ) then
    alter table public.collection_products
    add constraint collection_products_sort_order_nonnegative_check
    check (sort_order >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'product_variants_price_nonnegative_check'
  ) then
    alter table public.product_variants
    add constraint product_variants_price_nonnegative_check
    check (price_cents >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'product_variants_inventory_nonnegative_check'
  ) then
    alter table public.product_variants
    add constraint product_variants_inventory_nonnegative_check
    check (inventory_count >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'product_variants_sort_order_nonnegative_check'
  ) then
    alter table public.product_variants
    add constraint product_variants_sort_order_nonnegative_check
    check (sort_order >= 0);
  end if;
end
$$;

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
  client_order_key text,
  subtotal_cents integer not null default 0 check (subtotal_cents >= 0),
  discount_code text,
  discount_cents integer not null default 0 check (discount_cents >= 0),
  gift_card_code text,
  gift_card_cents integer not null default 0 check (gift_card_cents >= 0),
  shipping_cents integer not null default 0 check (shipping_cents >= 0),
  tax_cents integer not null default 0 check (tax_cents >= 0),
  tax_rate_bps integer not null default 0 check (tax_rate_bps >= 0 and tax_rate_bps <= 10000),
  total_cents integer not null default 0 check (total_cents >= 0),
  amount_due_cents integer not null default 0 check (amount_due_cents >= 0),
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
alter table public.orders add column if not exists client_order_key text;
alter table public.orders add column if not exists subtotal_cents integer not null default 0 check (subtotal_cents >= 0);
alter table public.orders add column if not exists discount_code text;
alter table public.orders add column if not exists discount_cents integer not null default 0 check (discount_cents >= 0);
alter table public.orders add column if not exists gift_card_code text;
alter table public.orders add column if not exists gift_card_cents integer not null default 0 check (gift_card_cents >= 0);
alter table public.orders add column if not exists shipping_cents integer not null default 0 check (shipping_cents >= 0);
alter table public.orders add column if not exists tax_cents integer not null default 0 check (tax_cents >= 0);
alter table public.orders add column if not exists tax_rate_bps integer not null default 0 check (tax_rate_bps >= 0 and tax_rate_bps <= 10000);
alter table public.orders add column if not exists amount_due_cents integer not null default 0 check (amount_due_cents >= 0);
alter table public.orders add column if not exists paid_at timestamptz;
alter table public.orders add column if not exists fulfilled_at timestamptz;
alter table public.orders add column if not exists cancelled_at timestamptz;
alter table public.orders add column if not exists inventory_restocked_at timestamptz;
alter table public.orders add column if not exists tracking_carrier text;
alter table public.orders add column if not exists tracking_number text;
alter table public.orders add column if not exists tracking_url text;
alter table public.orders add column if not exists fulfillment_note text;

update public.orders
set discount_cents = subtotal_cents
where discount_cents > subtotal_cents;

update public.orders
set total_cents = subtotal_cents - discount_cents + shipping_cents + tax_cents
where total_cents <> subtotal_cents - discount_cents + shipping_cents + tax_cents;

update public.orders
set gift_card_cents = total_cents
where gift_card_cents > total_cents;

update public.orders
set amount_due_cents = greatest(0, total_cents - gift_card_cents)
where amount_due_cents > greatest(0, total_cents - gift_card_cents);

update public.orders
set paid_at = created_at
where paid_at is null
  and (
    status in ('paid', 'fulfilled') or
    payment_status in ('paid', 'partially_refunded', 'refunded')
  );

update public.orders
set fulfilled_at = coalesce(paid_at, created_at)
where fulfilled_at is null and status = 'fulfilled';

update public.orders
set cancelled_at = created_at
where cancelled_at is null and status = 'cancelled';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_discount_not_above_subtotal_check'
  ) then
    alter table public.orders
    add constraint orders_discount_not_above_subtotal_check
    check (discount_cents <= subtotal_cents);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_total_math_check'
  ) then
    alter table public.orders
    add constraint orders_total_math_check
    check (total_cents = subtotal_cents - discount_cents + shipping_cents + tax_cents);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_gift_card_not_above_total_check'
  ) then
    alter table public.orders
    add constraint orders_gift_card_not_above_total_check
    check (gift_card_cents <= total_cents);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_amount_due_not_above_payable_check'
  ) then
    alter table public.orders
    add constraint orders_amount_due_not_above_payable_check
    check (amount_due_cents <= greatest(0, total_cents - gift_card_cents));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_paid_timestamp_check'
  ) then
    alter table public.orders
    add constraint orders_paid_timestamp_check
    check (
      not (
        status in ('paid', 'fulfilled') or
        payment_status in ('paid', 'partially_refunded', 'refunded')
      ) or paid_at is not null
    );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_fulfilled_timestamp_check'
  ) then
    alter table public.orders
    add constraint orders_fulfilled_timestamp_check
    check (status <> 'fulfilled' or fulfilled_at is not null);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_cancelled_timestamp_check'
  ) then
    alter table public.orders
    add constraint orders_cancelled_timestamp_check
    check (status <> 'cancelled' or cancelled_at is not null);
  end if;
end
$$;

create table if not exists public.customer_profiles (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  email text not null,
  name text,
  phone text,
  note text,
  tags text[] not null default '{}',
  accepts_marketing boolean not null default false,
  tax_exempt boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, email)
);

alter table public.customer_profiles add column if not exists name text;
alter table public.customer_profiles add column if not exists phone text;
alter table public.customer_profiles add column if not exists note text;
alter table public.customer_profiles add column if not exists tags text[] not null default '{}';
alter table public.customer_profiles add column if not exists accepts_marketing boolean not null default false;
alter table public.customer_profiles add column if not exists tax_exempt boolean not null default false;

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

create table if not exists public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  order_item_id uuid references public.order_items(id) on delete set null,
  customer_email text not null,
  customer_name text not null,
  rating integer not null check (rating >= 1 and rating <= 5),
  title text,
  body text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  merchant_reply text,
  reviewed_at timestamptz not null default now(),
  approved_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.product_reviews add column if not exists order_item_id uuid references public.order_items(id) on delete set null;
alter table public.product_reviews add column if not exists title text;
alter table public.product_reviews add column if not exists status text not null default 'pending' check (status in ('pending', 'approved', 'rejected'));
alter table public.product_reviews add column if not exists merchant_reply text;
alter table public.product_reviews add column if not exists reviewed_at timestamptz not null default now();
alter table public.product_reviews add column if not exists approved_at timestamptz;
alter table public.product_reviews add column if not exists rejected_at timestamptz;

update public.product_reviews
set approved_at = coalesce(approved_at, reviewed_at, created_at)
where status = 'approved' and approved_at is null;

update public.product_reviews
set rejected_at = coalesce(rejected_at, reviewed_at, created_at)
where status = 'rejected' and rejected_at is null;

update public.product_reviews
set rejected_at = null
where status = 'approved' and rejected_at is not null;

update public.product_reviews
set approved_at = null
where status = 'rejected' and approved_at is not null;

update public.product_reviews
set approved_at = null,
    rejected_at = null
where status = 'pending'
  and (approved_at is not null or rejected_at is not null);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'product_reviews_moderation_timestamp_check'
  ) then
    alter table public.product_reviews
    add constraint product_reviews_moderation_timestamp_check
    check (
      (
        status = 'pending' and
        approved_at is null and
        rejected_at is null
      ) or
      (
        status = 'approved' and
        approved_at is not null and
        rejected_at is null
      ) or
      (
        status = 'rejected' and
        rejected_at is not null and
        approved_at is null
      )
    );
  end if;
end
$$;

create table if not exists public.gift_cards (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  code text not null,
  initial_balance_cents integer not null check (initial_balance_cents > 0),
  balance_cents integer not null check (balance_cents >= 0),
  currency text not null default 'USD',
  status text not null default 'active' check (status in ('active', 'disabled', 'expired')),
  recipient_email text,
  note text,
  expires_at timestamptz,
  created_by_user_id text references public.profiles(clerk_user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, code)
);

alter table public.gift_cards add column if not exists initial_balance_cents integer not null default 0 check (initial_balance_cents >= 0);
alter table public.gift_cards add column if not exists balance_cents integer not null default 0 check (balance_cents >= 0);
alter table public.gift_cards add column if not exists currency text not null default 'USD';
alter table public.gift_cards add column if not exists status text not null default 'active' check (status in ('active', 'disabled', 'expired'));
alter table public.gift_cards add column if not exists recipient_email text;
alter table public.gift_cards add column if not exists note text;
alter table public.gift_cards add column if not exists expires_at timestamptz;
alter table public.gift_cards add column if not exists created_by_user_id text references public.profiles(clerk_user_id) on delete set null;

update public.gift_cards
set initial_balance_cents = balance_cents
where balance_cents > initial_balance_cents;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'gift_cards_balance_not_above_initial_check'
  ) then
    alter table public.gift_cards
    add constraint gift_cards_balance_not_above_initial_check
    check (balance_cents <= initial_balance_cents);
  end if;
end
$$;

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

update public.discount_codes
set value = 100
where type = 'percent' and value > 100;

update public.discount_codes
set usage_limit = redemption_count
where usage_limit is not null and redemption_count > usage_limit;

update public.discount_codes
set ends_at = null
where starts_at is not null and ends_at is not null and ends_at <= starts_at;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'discount_codes_value_bounds_check'
  ) then
    alter table public.discount_codes
    add constraint discount_codes_value_bounds_check
    check (
      (type = 'percent' and value between 1 and 100) or
      (type = 'fixed' and value > 0)
    );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'discount_codes_redemption_limit_check'
  ) then
    alter table public.discount_codes
    add constraint discount_codes_redemption_limit_check
    check (usage_limit is null or redemption_count <= usage_limit);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'discount_codes_date_window_check'
  ) then
    alter table public.discount_codes
    add constraint discount_codes_date_window_check
    check (starts_at is null or ends_at is null or ends_at > starts_at);
  end if;
end
$$;

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

create table if not exists public.order_fulfillments (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  clerk_user_id text references public.profiles(clerk_user_id) on delete set null,
  status text not null default 'created' check (status in ('created', 'in_transit', 'delivered', 'cancelled')),
  tracking_carrier text,
  tracking_number text,
  tracking_url text,
  note text,
  shipped_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.order_fulfillments add column if not exists clerk_user_id text references public.profiles(clerk_user_id) on delete set null;
alter table public.order_fulfillments add column if not exists status text not null default 'created' check (status in ('created', 'in_transit', 'delivered', 'cancelled'));
alter table public.order_fulfillments add column if not exists tracking_carrier text;
alter table public.order_fulfillments add column if not exists tracking_number text;
alter table public.order_fulfillments add column if not exists tracking_url text;
alter table public.order_fulfillments add column if not exists note text;
alter table public.order_fulfillments add column if not exists shipped_at timestamptz;
alter table public.order_fulfillments add column if not exists delivered_at timestamptz;
alter table public.order_fulfillments add column if not exists cancelled_at timestamptz;

update public.order_fulfillments
set shipped_at = coalesce(shipped_at, created_at)
where status in ('in_transit', 'delivered') and shipped_at is null;

update public.order_fulfillments
set delivered_at = coalesce(delivered_at, shipped_at, created_at)
where status = 'delivered' and delivered_at is null;

update public.order_fulfillments
set cancelled_at = coalesce(cancelled_at, created_at)
where status = 'cancelled' and cancelled_at is null;

update public.order_fulfillments
set shipped_at = null,
    delivered_at = null,
    cancelled_at = null
where status = 'created'
  and (
    shipped_at is not null or
    delivered_at is not null or
    cancelled_at is not null
  );

update public.order_fulfillments
set delivered_at = null,
    cancelled_at = null
where status = 'in_transit'
  and (delivered_at is not null or cancelled_at is not null);

update public.order_fulfillments
set cancelled_at = null
where status = 'delivered' and cancelled_at is not null;

update public.order_fulfillments
set delivered_at = null
where status = 'cancelled' and delivered_at is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'order_fulfillments_lifecycle_timestamp_check'
  ) then
    alter table public.order_fulfillments
    add constraint order_fulfillments_lifecycle_timestamp_check
    check (
      (
        status = 'created' and
        shipped_at is null and
        delivered_at is null and
        cancelled_at is null
      ) or
      (
        status = 'in_transit' and
        shipped_at is not null and
        delivered_at is null and
        cancelled_at is null
      ) or
      (
        status = 'delivered' and
        shipped_at is not null and
        delivered_at is not null and
        cancelled_at is null
      ) or
      (
        status = 'cancelled' and
        delivered_at is null and
        cancelled_at is not null
      )
    );
  end if;
end
$$;

create table if not exists public.gift_card_redemptions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  gift_card_id uuid not null references public.gift_cards(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  balance_before_cents integer not null check (balance_before_cents >= 0),
  balance_after_cents integer not null check (balance_after_cents >= 0),
  created_at timestamptz not null default now(),
  unique (gift_card_id, order_id)
);

update public.gift_card_redemptions
set balance_after_cents = balance_before_cents - amount_cents
where balance_before_cents >= amount_cents
  and balance_after_cents <> balance_before_cents - amount_cents;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'gift_card_redemptions_balance_math_check'
  ) then
    alter table public.gift_card_redemptions
    add constraint gift_card_redemptions_balance_math_check
    check (balance_before_cents - amount_cents = balance_after_cents);
  end if;
end
$$;

create table if not exists public.order_refunds (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  clerk_user_id text not null references public.profiles(clerk_user_id) on delete restrict,
  amount_cents integer not null check (amount_cents > 0),
  gift_card_cents integer not null default 0 check (gift_card_cents >= 0),
  payment_cents integer not null default 0 check (payment_cents >= 0),
  reason text not null default 'other' check (reason in ('customer_request', 'damaged', 'fraud', 'other')),
  note text,
  restocked_inventory boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.order_refunds add column if not exists gift_card_cents integer not null default 0 check (gift_card_cents >= 0);
alter table public.order_refunds add column if not exists payment_cents integer not null default 0 check (payment_cents >= 0);
alter table public.order_refunds add column if not exists note text;
alter table public.order_refunds add column if not exists restocked_inventory boolean not null default false;

update public.order_refunds
set payment_cents = amount_cents - gift_card_cents
where gift_card_cents + payment_cents <> amount_cents
  and gift_card_cents <= amount_cents;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'order_refunds_tender_sum_check'
  ) then
    alter table public.order_refunds
    add constraint order_refunds_tender_sum_check
    check (gift_card_cents + payment_cents = amount_cents);
  end if;
end
$$;

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

update public.order_return_requests
set resolved_at = coalesce(resolved_at, created_at)
where status in ('rejected', 'resolved') and resolved_at is null;

update public.order_return_requests
set resolved_at = null
where status in ('requested', 'approved') and resolved_at is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'order_return_requests_resolution_timestamp_check'
  ) then
    alter table public.order_return_requests
    add constraint order_return_requests_resolution_timestamp_check
    check (
      (
        status in ('requested', 'approved') and
        resolved_at is null
      ) or
      (
        status in ('rejected', 'resolved') and
        resolved_at is not null
      )
    );
  end if;
end
$$;

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

create or replace function public.enforce_order_refund_limit()
returns trigger
language plpgsql
as $$
declare
  existing_refund_cents integer;
  order_total_cents integer;
begin
  select total_cents
  into order_total_cents
  from public.orders
  where id = new.order_id and store_id = new.store_id
  for update;

  if order_total_cents is null then
    raise exception 'Refund order not found.'
      using errcode = '23503';
  end if;

  select coalesce(sum(amount_cents), 0)
  into existing_refund_cents
  from public.order_refunds
  where order_id = new.order_id
    and store_id = new.store_id
    and id <> new.id;

  if existing_refund_cents + new.amount_cents > order_total_cents then
    raise exception 'Refund exceeds the remaining refundable amount.'
      using errcode = '23514';
  end if;

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

drop trigger if exists store_pages_set_updated_at on public.store_pages;
create trigger store_pages_set_updated_at
before update on public.store_pages
for each row execute function public.set_updated_at();

drop trigger if exists store_navigation_menus_set_updated_at on public.store_navigation_menus;
create trigger store_navigation_menus_set_updated_at
before update on public.store_navigation_menus
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

drop trigger if exists order_refunds_enforce_refund_limit on public.order_refunds;
create trigger order_refunds_enforce_refund_limit
before insert or update on public.order_refunds
for each row execute function public.enforce_order_refund_limit();

drop trigger if exists customer_profiles_set_updated_at on public.customer_profiles;
create trigger customer_profiles_set_updated_at
before update on public.customer_profiles
for each row execute function public.set_updated_at();

drop trigger if exists order_fulfillments_set_updated_at on public.order_fulfillments;
create trigger order_fulfillments_set_updated_at
before update on public.order_fulfillments
for each row execute function public.set_updated_at();

drop trigger if exists abandoned_checkouts_set_updated_at on public.abandoned_checkouts;
create trigger abandoned_checkouts_set_updated_at
before update on public.abandoned_checkouts
for each row execute function public.set_updated_at();

drop trigger if exists product_reviews_set_updated_at on public.product_reviews;
create trigger product_reviews_set_updated_at
before update on public.product_reviews
for each row execute function public.set_updated_at();

drop trigger if exists gift_cards_set_updated_at on public.gift_cards;
create trigger gift_cards_set_updated_at
before update on public.gift_cards
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
create index if not exists store_pages_store_id_status_idx
on public.store_pages(store_id, status);
create index if not exists store_pages_store_id_slug_idx
on public.store_pages(store_id, slug);
create index if not exists store_navigation_menus_store_id_location_idx
on public.store_navigation_menus(store_id, location);
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
create unique index if not exists orders_store_client_order_key_unique_idx
on public.orders(store_id, client_order_key)
where client_order_key is not null and client_order_key <> '';
create index if not exists customer_profiles_store_id_updated_at_idx
on public.customer_profiles(store_id, updated_at desc);
create index if not exists customer_profiles_email_idx
on public.customer_profiles(lower(email));
create index if not exists abandoned_checkouts_store_id_last_seen_idx
on public.abandoned_checkouts(store_id, last_seen_at desc);
create index if not exists abandoned_checkouts_store_id_status_idx
on public.abandoned_checkouts(store_id, status, last_seen_at desc);
create unique index if not exists abandoned_checkouts_store_recovery_token_unique_idx
on public.abandoned_checkouts(store_id, recovery_token)
where recovery_token <> '';
create index if not exists abandoned_checkouts_customer_email_idx
on public.abandoned_checkouts(lower(customer_email));
create index if not exists product_reviews_store_id_created_at_idx
on public.product_reviews(store_id, created_at desc);
create index if not exists product_reviews_product_id_status_idx
on public.product_reviews(product_id, status, created_at desc);
create index if not exists product_reviews_order_id_idx
on public.product_reviews(order_id, created_at desc);
create unique index if not exists product_reviews_order_item_unique_idx
on public.product_reviews(store_id, order_item_id)
where order_item_id is not null;
create index if not exists gift_cards_store_id_created_at_idx
on public.gift_cards(store_id, created_at desc);
create index if not exists gift_cards_store_id_status_idx
on public.gift_cards(store_id, status, created_at desc);
create index if not exists gift_cards_recipient_email_idx
on public.gift_cards(lower(recipient_email))
where recipient_email is not null and recipient_email <> '';
create index if not exists gift_card_redemptions_gift_card_id_created_at_idx
on public.gift_card_redemptions(gift_card_id, created_at desc);
create index if not exists gift_card_redemptions_order_id_idx
on public.gift_card_redemptions(order_id);
create index if not exists order_items_order_id_idx on public.order_items(order_id);
create index if not exists order_items_product_variant_id_idx on public.order_items(product_variant_id);
create index if not exists order_fulfillments_store_id_created_at_idx
on public.order_fulfillments(store_id, created_at desc);
create index if not exists order_fulfillments_order_id_created_at_idx
on public.order_fulfillments(order_id, created_at desc);
create index if not exists order_fulfillments_order_id_status_idx
on public.order_fulfillments(order_id, status);
create index if not exists order_refunds_store_id_created_at_idx on public.order_refunds(store_id, created_at desc);
create index if not exists order_refunds_order_id_created_at_idx on public.order_refunds(order_id, created_at desc);
create index if not exists order_return_requests_store_id_status_idx
on public.order_return_requests(store_id, status, created_at desc);
create index if not exists order_return_requests_order_id_created_at_idx
on public.order_return_requests(order_id, created_at desc);
create unique index if not exists order_return_requests_active_order_unique_idx
on public.order_return_requests(store_id, order_id)
where status in ('requested', 'approved');
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
alter table public.store_pages enable row level security;
alter table public.store_navigation_menus enable row level security;
alter table public.shipping_zones enable row level security;
alter table public.products enable row level security;
alter table public.collections enable row level security;
alter table public.collection_products enable row level security;
alter table public.product_variants enable row level security;
alter table public.orders enable row level security;
alter table public.customer_profiles enable row level security;
alter table public.abandoned_checkouts enable row level security;
alter table public.product_reviews enable row level security;
alter table public.gift_cards enable row level security;
alter table public.gift_card_redemptions enable row level security;
alter table public.order_items enable row level security;
alter table public.order_fulfillments enable row level security;
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

drop policy if exists "public published store page reads" on public.store_pages;
create policy "public published store page reads"
on public.store_pages for select
using (
  status = 'published'
  and exists (
    select 1 from public.stores
    where stores.id = store_pages.store_id
    and stores.status = 'active'
  )
);

drop policy if exists "public active store navigation reads" on public.store_navigation_menus;
create policy "public active store navigation reads"
on public.store_navigation_menus for select
using (
  exists (
    select 1 from public.stores
    where stores.id = store_navigation_menus.store_id
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
