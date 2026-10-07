-- This regression test depends on supabase/seed.sql being loaded by
-- `supabase db reset` before `supabase test db` runs.

begin;

select plan(26);

select is(
  (select count(*)::int from public.categories),
  5,
  'the development seed loads exactly five Categories'
);

select results_eq(
  $$select id, name, active, display_order from public.categories order by display_order$$,
  $$values
    ('f0000000-0000-4000-8000-000000000001'::uuid, 'Bread'::text, true, 0),
    ('f0000000-0000-4000-8000-000000000002'::uuid, 'Pastries'::text, true, 1),
    ('f0000000-0000-4000-8000-000000000003'::uuid, 'Cakes'::text, true, 2),
    ('f0000000-0000-4000-8000-000000000004'::uuid, 'Savory'::text, true, 3),
    ('f0000000-0000-4000-8000-000000000005'::uuid, 'Seasonal Archive'::text, false, 4)$$,
  'the expected Category UUIDs, names, states and order are seeded'
);

select is(
  (select count(*)::int from public.categories where active),
  4,
  'four seeded Categories are active'
);

select is(
  (select active from public.categories where id = 'f0000000-0000-4000-8000-000000000005'),
  false,
  'Seasonal Archive is inactive'
);

select is(
  (select count(*)::int from public.products),
  12,
  'the development seed loads exactly twelve Products'
);

select results_eq(
  $$select id from public.products order by id$$,
  $$values
    ('f1000000-0000-4000-8000-000000000001'::uuid),
    ('f1000000-0000-4000-8000-000000000002'::uuid),
    ('f1000000-0000-4000-8000-000000000003'::uuid),
    ('f1000000-0000-4000-8000-000000000004'::uuid),
    ('f1000000-0000-4000-8000-000000000005'::uuid),
    ('f1000000-0000-4000-8000-000000000006'::uuid),
    ('f1000000-0000-4000-8000-000000000007'::uuid),
    ('f1000000-0000-4000-8000-000000000008'::uuid),
    ('f1000000-0000-4000-8000-000000000009'::uuid),
    ('f1000000-0000-4000-8000-000000000010'::uuid),
    ('f1000000-0000-4000-8000-000000000011'::uuid),
    ('f1000000-0000-4000-8000-000000000012'::uuid)$$,
  'the exact deterministic Product UUID set is seeded'
);

select results_eq(
  $$select id, category_id from public.products order by id$$,
  $$values
    ('f1000000-0000-4000-8000-000000000001'::uuid, 'f0000000-0000-4000-8000-000000000001'::uuid),
    ('f1000000-0000-4000-8000-000000000002'::uuid, 'f0000000-0000-4000-8000-000000000001'::uuid),
    ('f1000000-0000-4000-8000-000000000003'::uuid, 'f0000000-0000-4000-8000-000000000001'::uuid),
    ('f1000000-0000-4000-8000-000000000004'::uuid, 'f0000000-0000-4000-8000-000000000002'::uuid),
    ('f1000000-0000-4000-8000-000000000005'::uuid, 'f0000000-0000-4000-8000-000000000002'::uuid),
    ('f1000000-0000-4000-8000-000000000006'::uuid, 'f0000000-0000-4000-8000-000000000002'::uuid),
    ('f1000000-0000-4000-8000-000000000007'::uuid, 'f0000000-0000-4000-8000-000000000003'::uuid),
    ('f1000000-0000-4000-8000-000000000008'::uuid, 'f0000000-0000-4000-8000-000000000003'::uuid),
    ('f1000000-0000-4000-8000-000000000009'::uuid, 'f0000000-0000-4000-8000-000000000004'::uuid),
    ('f1000000-0000-4000-8000-000000000010'::uuid, 'f0000000-0000-4000-8000-000000000004'::uuid),
    ('f1000000-0000-4000-8000-000000000011'::uuid, 'f0000000-0000-4000-8000-000000000004'::uuid),
    ('f1000000-0000-4000-8000-000000000012'::uuid, 'f0000000-0000-4000-8000-000000000005'::uuid)$$,
  'every seeded Product has the expected Category relationship'
);

select is(
  (select name from public.products where id = 'f1000000-0000-4000-8000-000000000005'),
  'Chocolate Croissant',
  'the designated unavailable Product is Chocolate Croissant'
);
select is(
  (select active from public.products where id = 'f1000000-0000-4000-8000-000000000005'),
  true,
  'Chocolate Croissant is active'
);
select is(
  (select available from public.products where id = 'f1000000-0000-4000-8000-000000000005'),
  false,
  'Chocolate Croissant is unavailable'
);
select is(
  (select count(*)::int
   from public.products p
   join public.categories c on c.id = p.category_id
   where c.active and p.active and not p.available),
  1,
  'exactly one active Product in an active Category is unavailable'
);

select is(
  (select name from public.products where id = 'f1000000-0000-4000-8000-000000000011'),
  'Ham and Cheese Croissant',
  'the designated inactive Product is Ham and Cheese Croissant'
);
select is(
  (select active from public.products where id = 'f1000000-0000-4000-8000-000000000011'),
  false,
  'Ham and Cheese Croissant is inactive'
);
select is(
  (select available from public.products where id = 'f1000000-0000-4000-8000-000000000011'),
  true,
  'Ham and Cheese Croissant remains available'
);
select is(
  (select count(*)::int
   from public.products p
   join public.categories c on c.id = p.category_id
   where c.active and not p.active and p.available),
  1,
  'exactly one inactive Product in an active Category remains available'
);
select is(
  (select count(*)::int from public.products where active and available),
  10,
  'the remaining ten Products are active and available'
);

select is(
  (select name from public.products where id = 'f1000000-0000-4000-8000-000000000012'),
  'Winter Spice Loaf',
  'the archived Product is Winter Spice Loaf'
);
select is(
  (select active from public.products where id = 'f1000000-0000-4000-8000-000000000012'),
  true,
  'Winter Spice Loaf remains active at Product level'
);
select is(
  (select available from public.products where id = 'f1000000-0000-4000-8000-000000000012'),
  true,
  'Winter Spice Loaf remains available at Product level'
);
select is(
  (select c.active
   from public.products p
   join public.categories c on c.id = p.category_id
   where p.id = 'f1000000-0000-4000-8000-000000000012'),
  false,
  'Winter Spice Loaf belongs to inactive Seasonal Archive'
);

select is(
  (select count(*)::int from public.products where image_path is null),
  12,
  'all seeded Products have no image path'
);
select is(
  (select count(*)::int from public.products where availability_updated_at is null),
  12,
  'all seeded Products have no availability timestamp'
);
select is(
  (select count(*)::int from public.products where availability_updated_by is null),
  12,
  'all seeded Products have no availability actor'
);
select is(
  (select count(*)::int from public.products where quantity_step <= 0),
  0,
  'all seeded quantity steps are positive'
);
select results_eq(
  $$select distinct unit_code from public.products order by unit_code$$,
  $$values ('KG'::text), ('TRAY'::text), ('UNIT'::text)$$,
  'seeded units are limited to UNIT, TRAY and KG'
);
select is(
  (select count(*)::int
   from information_schema.columns
   where table_schema = 'public'
     and table_name in ('categories', 'products')
     and (column_name ilike '%price%' or column_name ilike '%cost%')),
  0,
  'the catalog schema has no pricing columns'
);

select * from finish();

rollback;
