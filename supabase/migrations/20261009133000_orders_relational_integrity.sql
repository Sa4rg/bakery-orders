-- M3-001C Order relational integrity and idempotency constraints.

alter table public.orders
  add constraint orders_business_id_fkey
    foreign key (business_id)
    references public.businesses (id)
    on delete restrict,

  add constraint orders_created_by_user_id_fkey
    foreign key (created_by_user_id)
    references public.profiles (id)
    on delete restrict,

  add constraint orders_order_number_key
    unique (order_number),

  add constraint orders_created_by_user_id_idempotency_key_key
    unique (created_by_user_id, idempotency_key);