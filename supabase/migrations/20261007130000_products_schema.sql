-- M2-002 product schema.

create table public.products (
  id uuid not null default gen_random_uuid(),
  category_id uuid not null,
  name text not null,
  description text,
  unit_code text not null,
  quantity_step numeric(12,3) not null,
  image_path text,
  active boolean not null,
  available boolean not null,
  availability_updated_at timestamptz,
  availability_updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_pkey primary key (id),
  constraint products_category_id_fkey
    foreign key (category_id) references public.categories (id) on delete restrict,
  constraint products_availability_updated_by_fkey
    foreign key (availability_updated_by) references public.profiles (id) on delete restrict,
  constraint products_name_not_blank
    check (length(btrim(name, E' \t\r\n')) > 0),
  constraint products_unit_code_not_blank
    check (length(btrim(unit_code, E' \t\r\n')) > 0),
  constraint products_quantity_step_positive
    check (quantity_step > 0)
);

create index products_category_id_idx
  on public.products (category_id);
