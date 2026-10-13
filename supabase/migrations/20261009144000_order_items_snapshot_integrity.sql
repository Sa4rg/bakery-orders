-- M3-002D OrderItem historical snapshot integrity and exact quantity-step semantics.

alter table public.order_items
  add constraint order_items_product_name_snapshot_nonblank
    check (
      length(btrim(product_name_snapshot, E' \t\r\n')) > 0
    ),

  add constraint order_items_unit_code_snapshot_nonblank
    check (
      length(btrim(unit_code_snapshot, E' \t\r\n')) > 0
    ),

  add constraint order_items_quantity_step_snapshot_positive
    check (
      quantity_step_snapshot > 0
    ),

  add constraint order_items_requested_quantity_matches_step
    check (
      mod(requested_quantity, quantity_step_snapshot) = 0
    );