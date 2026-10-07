-- M2-001 category schema.

create table public.categories (
  id uuid not null default gen_random_uuid(),
  name text not null,
  description text,
  active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_pkey primary key (id),
  constraint categories_name_not_blank
    check (length(btrim(name, E' \t\r\n')) > 0),
  constraint categories_display_order_non_negative
    check (display_order >= 0)
);

create unique index categories_name_lower_uidx
  on public.categories (lower(name));
