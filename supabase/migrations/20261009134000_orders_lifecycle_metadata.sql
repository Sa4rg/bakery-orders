-- M3-001D1 Order lifecycle actor and timestamp metadata.

alter table public.orders
  add column started_at timestamptz,
  add column started_by_user_id uuid,
  add column ready_at timestamptz,
  add column ready_by_user_id uuid,
  add column dispatched_at timestamptz,
  add column dispatched_by_user_id uuid,
  add column delivered_at timestamptz,
  add column delivered_by_user_id uuid,
  add column cancelled_at timestamptz,
  add column cancelled_by_user_id uuid,
  add column cancellation_reason text,

  add constraint orders_started_by_user_id_fkey
    foreign key (started_by_user_id)
    references public.profiles (id)
    on delete restrict,

  add constraint orders_ready_by_user_id_fkey
    foreign key (ready_by_user_id)
    references public.profiles (id)
    on delete restrict,

  add constraint orders_dispatched_by_user_id_fkey
    foreign key (dispatched_by_user_id)
    references public.profiles (id)
    on delete restrict,

  add constraint orders_delivered_by_user_id_fkey
    foreign key (delivered_by_user_id)
    references public.profiles (id)
    on delete restrict,

  add constraint orders_cancelled_by_user_id_fkey
    foreign key (cancelled_by_user_id)
    references public.profiles (id)
    on delete restrict;