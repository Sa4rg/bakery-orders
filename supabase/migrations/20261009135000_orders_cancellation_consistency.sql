-- M3-001D2 Keep cancellation state and metadata structurally consistent.

alter table public.orders
  add constraint orders_cancellation_metadata_consistent
  check (
    (
      status = 'CANCELLED'
      and cancelled_at is not null
      and cancelled_by_user_id is not null
      and cancellation_reason is not null
      and length(btrim(cancellation_reason, E' \t\r\n')) > 0
    )
    or
    (
      status <> 'CANCELLED'
      and cancelled_at is null
      and cancelled_by_user_id is null
      and cancellation_reason is null
    )
  );