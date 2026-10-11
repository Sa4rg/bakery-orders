-- M3-003B OrderEvent event-type integrity.

alter table public.order_events
  add constraint order_events_event_type_valid
    check (
      event_type in (
        'ORDER_CREATED',
        'PREPARATION_STARTED',
        'QUANTITY_PREPARED',
        'QUANTITY_UNAVAILABLE',
        'ORDER_READY',
        'ORDER_DISPATCHED',
        'ORDER_DELIVERED',
        'ORDER_CANCELLED'
      )
    );