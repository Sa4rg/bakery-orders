-- M3-003A OrderEvent foundation: append-oriented audit structure.

create table public.order_events (
  id uuid not null default gen_random_uuid(),

  order_id uuid not null,
  order_item_id uuid,
  actor_user_id uuid,

  event_type text not null,
  reason text,

  previous_value jsonb,
  new_value jsonb,
  metadata jsonb not null,

  occurred_at timestamptz not null default now(),

  constraint order_events_pkey
    primary key (id),

  constraint order_events_order_id_fkey
    foreign key (order_id)
    references public.orders (id)
    on delete restrict,

  constraint order_events_order_item_id_fkey
    foreign key (order_item_id)
    references public.order_items (id)
    on delete restrict,

  constraint order_events_actor_user_id_fkey
    foreign key (actor_user_id)
    references public.profiles (id)
    on delete restrict
);