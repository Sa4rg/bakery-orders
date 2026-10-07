-- Fictional M2-003 catalog data for local development and demos only.
-- UUID ranges f0000000 and f1000000 are reserved for this development seed.

insert into public.categories (
  id,
  name,
  description,
  active,
  display_order
)
values
  (
    'f0000000-0000-4000-8000-000000000001',
    'Bread',
    'Everyday loaves and long-fermented breads.',
    true,
    0
  ),
  (
    'f0000000-0000-4000-8000-000000000002',
    'Pastries',
    'Laminated pastries and sweet baked treats.',
    true,
    1
  ),
  (
    'f0000000-0000-4000-8000-000000000003',
    'Cakes',
    'Celebration cakes and tray-baked desserts.',
    true,
    2
  ),
  (
    'f0000000-0000-4000-8000-000000000004',
    'Savory',
    'Handheld savory bakes and sharing dishes.',
    true,
    3
  ),
  (
    'f0000000-0000-4000-8000-000000000005',
    'Seasonal Archive',
    'Retired seasonal recipes retained for catalog history.',
    false,
    4
  );

insert into public.products (
  id,
  category_id,
  name,
  description,
  unit_code,
  quantity_step,
  image_path,
  active,
  available,
  availability_updated_at,
  availability_updated_by
)
values
  (
    'f1000000-0000-4000-8000-000000000001',
    'f0000000-0000-4000-8000-000000000001',
    'Country Sourdough',
    'Naturally leavened loaf with a crisp crust and open crumb.',
    'UNIT',
    1,
    null,
    true,
    true,
    null,
    null
  ),
  (
    'f1000000-0000-4000-8000-000000000002',
    'f0000000-0000-4000-8000-000000000001',
    'Whole Wheat Loaf',
    'Soft whole wheat loaf for everyday service.',
    'UNIT',
    1,
    null,
    true,
    true,
    null,
    null
  ),
  (
    'f1000000-0000-4000-8000-000000000003',
    'f0000000-0000-4000-8000-000000000001',
    'Rustic Baguette',
    'Golden baguette with a light, airy interior.',
    'UNIT',
    1,
    null,
    true,
    true,
    null,
    null
  ),
  (
    'f1000000-0000-4000-8000-000000000004',
    'f0000000-0000-4000-8000-000000000002',
    'Butter Croissant',
    'Flaky crescent pastry with a buttery finish.',
    'UNIT',
    1,
    null,
    true,
    true,
    null,
    null
  ),
  (
    'f1000000-0000-4000-8000-000000000005',
    'f0000000-0000-4000-8000-000000000002',
    'Chocolate Croissant',
    'Laminated pastry filled with dark chocolate.',
    'UNIT',
    1,
    null,
    true,
    false,
    null,
    null
  ),
  (
    'f1000000-0000-4000-8000-000000000006',
    'f0000000-0000-4000-8000-000000000002',
    'Cinnamon Roll',
    'Swirled sweet roll with cinnamon filling.',
    'UNIT',
    1,
    null,
    true,
    true,
    null,
    null
  ),
  (
    'f1000000-0000-4000-8000-000000000007',
    'f0000000-0000-4000-8000-000000000003',
    'Carrot Cake',
    'Spiced carrot cake finished with a cream topping.',
    'TRAY',
    1,
    null,
    true,
    true,
    null,
    null
  ),
  (
    'f1000000-0000-4000-8000-000000000008',
    'f0000000-0000-4000-8000-000000000003',
    'Chocolate Celebration Cake',
    'Layered chocolate cake prepared for celebration service.',
    'KG',
    0.500,
    null,
    true,
    true,
    null,
    null
  ),
  (
    'f1000000-0000-4000-8000-000000000009',
    'f0000000-0000-4000-8000-000000000004',
    'Cheese Empanada',
    'Savory pastry filled with a mild cheese blend.',
    'UNIT',
    1,
    null,
    true,
    true,
    null,
    null
  ),
  (
    'f1000000-0000-4000-8000-000000000010',
    'f0000000-0000-4000-8000-000000000004',
    'Spinach Quiche',
    'Baked quiche with spinach in a crisp pastry shell.',
    'TRAY',
    1,
    null,
    true,
    true,
    null,
    null
  ),
  (
    'f1000000-0000-4000-8000-000000000011',
    'f0000000-0000-4000-8000-000000000004',
    'Ham and Cheese Croissant',
    'Savory filled croissant retained as an inactive listing.',
    'UNIT',
    1,
    null,
    false,
    true,
    null,
    null
  ),
  (
    'f1000000-0000-4000-8000-000000000012',
    'f0000000-0000-4000-8000-000000000005',
    'Winter Spice Loaf',
    'Archived seasonal loaf with a warm spice profile.',
    'UNIT',
    1,
    null,
    true,
    true,
    null,
    null
  );
