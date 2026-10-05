-- M1 identity schema: application roles, profiles, businesses and memberships.
-- Authorization (RLS and grants) is defined in the following migration.

create type public.app_role as enum ('CUSTOMER', 'KITCHEN', 'MANAGER');

-- Application data for an already authenticated identity.
-- Profiles are deactivated, never physically deleted (ON DELETE RESTRICT).
create table public.profiles (
  id uuid not null,
  display_name text not null,
  role public.app_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_pkey primary key (id),
  constraint profiles_id_fkey
    foreign key (id) references auth.users (id) on delete restrict,
  constraint profiles_display_name_not_blank
    check (length(btrim(display_name, E' \t\r\n')) > 0)
);

-- External establishment placing orders.
create table public.businesses (
  id uuid not null default gen_random_uuid(),
  name text not null,
  contact_name text,
  contact_phone text,
  delivery_address text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint businesses_pkey primary key (id),
  constraint businesses_name_not_blank
    check (length(btrim(name, E' \t\r\n')) > 0)
);

-- Authorizes a Profile to act for a Business.
create table public.business_memberships (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  business_id uuid not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_memberships_pkey primary key (id),
  constraint business_memberships_user_id_fkey
    foreign key (user_id) references public.profiles (id) on delete restrict,
  constraint business_memberships_business_id_fkey
    foreign key (business_id) references public.businesses (id) on delete restrict,
  constraint business_memberships_user_id_business_id_key
    unique (user_id, business_id)
);

-- Supports the active-membership lookups used by RLS policies.
create index business_memberships_user_id_active_idx
  on public.business_memberships (user_id, active);

create index business_memberships_business_id_active_idx
  on public.business_memberships (business_id, active);
