begin;

select plan(1);

select pass('pgTAP executes successfully');

select * from finish();

rollback;
