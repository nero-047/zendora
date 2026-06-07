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
  status text not null default 'draft' check (status in ('draft', 'active', 'paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.store_memberships (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  clerk_user_id text not null references public.profiles(clerk_user_id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'admin', 'staff')),
  created_at timestamptz not null default now(),
  unique (store_id, clerk_user_id)
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  slug text not null,
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

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  customer_email text not null,
  customer_name text,
  status text not null default 'pending' check (status in ('pending', 'paid', 'fulfilled', 'cancelled')),
  total_cents integer not null default 0 check (total_cents >= 0),
  currency text not null default 'USD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  unit_price_cents integer not null check (unit_price_cents >= 0),
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now()
);

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

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
before update on public.products
for each row execute function public.set_updated_at();

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

create index if not exists stores_owner_id_idx on public.stores(owner_id);
create index if not exists store_memberships_clerk_user_id_idx on public.store_memberships(clerk_user_id);
create index if not exists products_store_id_status_idx on public.products(store_id, status);
create index if not exists orders_store_id_created_at_idx on public.orders(store_id, created_at desc);
create index if not exists order_items_order_id_idx on public.order_items(order_id);

alter table public.profiles enable row level security;
alter table public.stores enable row level security;
alter table public.store_memberships enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

drop policy if exists "public active store reads" on public.stores;
create policy "public active store reads"
on public.stores for select
using (status = 'active');

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
