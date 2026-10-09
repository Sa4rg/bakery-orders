-- M3-002B OrderItem quantity invariants.

alter table public.order_items
  add constraint order_items_requested_quantity_positive
    check (requested_quantity > 0),

  add constraint order_items_prepared_quantity_nonnegative
    check (prepared_quantity >= 0),

  add constraint order_items_unavailable_quantity_nonnegative
    check (unavailable_quantity >= 0),

  add constraint order_items_fulfillment_within_requested
    check (
      prepared_quantity + unavailable_quantity
      <= requested_quantity
    );