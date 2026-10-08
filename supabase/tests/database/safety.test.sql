begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000c001', 'sw1@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000c002', 'sw2@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000c003', 'sm1@test.local', 'authenticated', 'authenticated');

insert into public.sites (id, code, name) values ('00000000-0000-0000-0000-0000000002b1', 'TS1', 'Участок безопасности');
insert into public.employees (id, auth_user_id, personnel_number, full_name, role, specialty) values
  ('00000000-0000-0000-0000-0000000002e1', '00000000-0000-0000-0000-00000000c001', '70001', 'Слесарь Высотник', 'worker', 'fitter'),
  ('00000000-0000-0000-0000-0000000002e2', '00000000-0000-0000-0000-00000000c002', '70002', 'Слесарь Чужой', 'worker', 'fitter'),
  ('00000000-0000-0000-0000-0000000002e3', '00000000-0000-0000-0000-00000000c003', '70003', 'Мастер Безопасности', 'master', null);
insert into public.employee_sites (employee_id, site_id) values ('00000000-0000-0000-0000-0000000002e3', '00000000-0000-0000-0000-0000000002b1');
insert into public.equipment (id, site_id, name, inventory_number, equipment_type, requires_lockout) values
  ('00000000-0000-0000-0000-0000000002c1', '00000000-0000-0000-0000-0000000002b1', 'Конвейер Т-3', 'INV-TS3', 'conveyor', true);
insert into public.permit_types (id, code, name) values ('00000000-0000-0000-0000-0000000002f1', 'test_height', 'Высота тест');
insert into public.equipment_permit_requirements (permit_type_id, equipment_type) values ('00000000-0000-0000-0000-0000000002f1', 'conveyor');
insert into public.employee_permits (employee_id, permit_type_id, certificate_number, issued_on, expires_on) values
  ('00000000-0000-0000-0000-0000000002e1', '00000000-0000-0000-0000-0000000002f1', 'OLD-1', '2020-01-01', '2021-01-01');
insert into public.work_orders (id, kind, priority, description, site_id, equipment_id, assignee_id, master_id, standard_hours, shift_period, status, accepted_at) values
  ('00000000-0000-0000-0000-0000000002d1', 'unplanned', 'high', 'Сход ленты', '00000000-0000-0000-0000-0000000002b1',
   '00000000-0000-0000-0000-0000000002c1', '00000000-0000-0000-0000-0000000002e1', '00000000-0000-0000-0000-0000000002e3', 2, 'day', 'accepted', now());

create function pg_temp.as_user(auth_id uuid, statement text) returns jsonb language plpgsql as $$
declare
  result jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', auth_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  execute statement into result;
  reset role;
  return result;
end;
$$;

select ok(
  pg_temp.as_user('00000000-0000-0000-0000-00000000c001', $$select public.start_gate('00000000-0000-0000-0000-0000000002d1')$$) -> 'missing_permits' @> '[{"code":"test_height"}]',
  'expired permit is reported as missing'
);
select is(
  (pg_temp.as_user('00000000-0000-0000-0000-00000000c001', $$select public.start_gate('00000000-0000-0000-0000-0000000002d1')$$) ->> 'lockout_required')::boolean,
  true,
  'conveyor work requires LOTO'
);
select ok(
  jsonb_array_length(pg_temp.as_user('00000000-0000-0000-0000-00000000c001', $$select public.start_gate('00000000-0000-0000-0000-0000000002d1')$$) -> 'checklist') >= 4,
  'checklist includes general and conveyor items'
);
select throws_ok(
  $$select pg_temp.as_user('00000000-0000-0000-0000-00000000c001', $q$select public.transition_work_order('00000000-0000-0000-0000-0000000002d1', 'start')$q$)$$,
  'P0001', 'wo:start_gate_blocked', 'cannot start with an expired permit'
);
select throws_ok(
  $$select pg_temp.as_user('00000000-0000-0000-0000-00000000c001', $q$select public.apply_lockout('00000000-0000-0000-0000-0000000002d1', '00000000-0000-0000-0000-0000000002d1/tag.jpg', null, '[]')$q$)$$,
  'P0001', 'wo:permit_missing', 'cannot lock out without a valid permit'
);

reset role;
update public.employee_permits set expires_on = '2030-01-01' where certificate_number = 'OLD-1';
insert into public.employee_permits (employee_id, permit_type_id, certificate_number, issued_on, expires_on)
select '00000000-0000-0000-0000-0000000002e1', r.permit_type_id, 'FIX-' || r.permit_type_id, '2025-01-01', '2030-01-01'
from public.equipment_permit_requirements r
where r.equipment_type = 'conveyor' and r.permit_type_id <> '00000000-0000-0000-0000-0000000002f1'
on conflict do nothing;

select throws_ok(
  $$select pg_temp.as_user('00000000-0000-0000-0000-00000000c001', $q$select public.transition_work_order('00000000-0000-0000-0000-0000000002d1', 'start')$q$)$$,
  'P0001', 'wo:start_gate_blocked', 'cannot start without an active lockout'
);
select throws_ok(
  $$select pg_temp.as_user('00000000-0000-0000-0000-00000000c002', $q$select public.apply_lockout('00000000-0000-0000-0000-0000000002d1', '00000000-0000-0000-0000-0000000002d1/tag.jpg', null, '[]')$q$)$$,
  'P0001', 'wo:forbidden', 'a stranger cannot lock out someone else''s order'
);
select isnt(
  pg_temp.as_user('00000000-0000-0000-0000-00000000c001', $$select public.apply_lockout('00000000-0000-0000-0000-0000000002d1', '00000000-0000-0000-0000-0000000002d1/tag.jpg', '{"hasLock":true}', '["ok"]')$$) ->> 'lockout_id',
  null,
  'assignee with a valid permit applies the lockout'
);
select is(
  pg_temp.as_user('00000000-0000-0000-0000-00000000c001', $$select public.transition_work_order('00000000-0000-0000-0000-0000000002d1', 'start')$$) ->> 'status',
  'in_progress',
  'work starts after permit and LOTO'
);

reset role;
update public.work_orders set status = 'ai_review' where id = '00000000-0000-0000-0000-0000000002d1';
select pg_temp.as_user('00000000-0000-0000-0000-00000000c003', $$select public.transition_work_order('00000000-0000-0000-0000-0000000002d1', 'approve')$$);
select isnt(
  (select released_at from public.lockouts where work_order_id = '00000000-0000-0000-0000-0000000002d1'),
  null,
  'closing the order releases the lockout'
);

select * from finish();
rollback;
