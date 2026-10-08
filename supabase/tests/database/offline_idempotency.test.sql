begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000f101', 'ow1@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000f102', 'ow2@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000f103', 'om1@test.local', 'authenticated', 'authenticated');

insert into public.sites (id, code, name) values ('00000000-0000-0000-0000-0000000002b1', 'OF1', 'Участок офлайн');

insert into public.employees (id, auth_user_id, personnel_number, full_name, role, specialty, brigade_id) values
  ('00000000-0000-0000-0000-0000000002e1', '00000000-0000-0000-0000-00000000f101', '81001', 'Слесарь Офлайнов', 'worker', 'fitter', null),
  ('00000000-0000-0000-0000-0000000002e2', '00000000-0000-0000-0000-00000000f102', '81002', 'Электрик Офлайнов', 'worker', 'electrician', null),
  ('00000000-0000-0000-0000-0000000002e3', '00000000-0000-0000-0000-00000000f103', '81003', 'Мастер Офлайнов', 'master', null, null);

insert into public.employee_sites (employee_id, site_id) values
  ('00000000-0000-0000-0000-0000000002e3', '00000000-0000-0000-0000-0000000002b1');

insert into public.equipment (id, site_id, name, inventory_number, equipment_type, downtime_cost_per_hour, requires_lockout) values
  ('00000000-0000-0000-0000-0000000002c1', '00000000-0000-0000-0000-0000000002b1', 'Насос О-1', 'INV-OF1', 'pump', 120000, false);

create function pg_temp.act_as(auth_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', auth_id, 'role', 'authenticated')::text, true);
$$;

create function pg_temp.new_order() returns uuid language plpgsql as $$
declare
  created jsonb;
begin
  perform pg_temp.act_as('00000000-0000-0000-0000-00000000f103');
  set local role authenticated;
  created := public.create_work_order(jsonb_build_object(
    'kind', 'planned', 'priority', 'normal', 'description', 'Проверка подшипника',
    'equipment_id', '00000000-0000-0000-0000-0000000002c1',
    'assignee_id', '00000000-0000-0000-0000-0000000002e1', 'standard_hours', 2
  ));
  reset role;
  return (created ->> 'id')::uuid;
end;
$$;

create function pg_temp.transition(auth_id uuid, order_id uuid, act text, payload jsonb default '{}')
returns jsonb language plpgsql as $$
declare
  result jsonb;
begin
  perform pg_temp.act_as(auth_id);
  set local role authenticated;
  result := public.transition_work_order(order_id, act::public.work_order_action, payload);
  reset role;
  return result;
end;
$$;

create temp table ids as select pg_temp.new_order() as first_order, pg_temp.new_order() as second_order;
grant select on ids to authenticated;

create temp table first_result as
select pg_temp.transition(
  '00000000-0000-0000-0000-00000000f101', (select first_order from ids), 'accept',
  '{"expected_status":"issued","client_action_id":"aaaaaaaa-0000-4000-8000-000000000001","device_at":"2026-10-11T08:15:00+05:00"}'
) as result;

select has_index('public', 'work_order_events', 'work_order_events_client_action_idx', 'client action ids are indexed');
select is((select result ->> 'status' from first_result), 'accepted', 'the first delivery applies the transition');

select is(
  pg_temp.transition(
    '00000000-0000-0000-0000-00000000f101', (select first_order from ids), 'accept',
    '{"expected_status":"issued","client_action_id":"aaaaaaaa-0000-4000-8000-000000000001","device_at":"2026-10-11T08:15:00+05:00"}'
  ) - 'replayed',
  (select result from first_result),
  'a repeated delivery returns the previous result instead of a stale status'
);
select is(
  (select count(*)::int from public.work_order_events e
   where e.payload ->> 'client_action_id' = 'aaaaaaaa-0000-4000-8000-000000000001'),
  1,
  'the repeated delivery writes no second event'
);
select is(
  (select device_at from public.work_order_events e
   where e.payload ->> 'client_action_id' = 'aaaaaaaa-0000-4000-8000-000000000001'),
  '2026-10-11T08:15:00+05:00'::timestamptz,
  'the device time of the queued action is kept'
);
select throws_ok(
  format(
    $$select pg_temp.transition('00000000-0000-0000-0000-00000000f101', %L, 'accept', '{"expected_status":"issued","client_action_id":"aaaaaaaa-0000-4000-8000-000000000002"}')$$,
    (select first_order from ids)
  ),
  'P0001', 'wo:stale_status', 'a new action with an outdated status is still a conflict'
);
select throws_ok(
  format(
    $$select pg_temp.transition('00000000-0000-0000-0000-00000000f101', %L, 'accept', '{"expected_status":"issued","client_action_id":"aaaaaaaa-0000-4000-8000-000000000001"}')$$,
    (select second_order from ids)
  ),
  'P0001', 'wo:invalid_transition', 'a reused action id cannot be applied to another order'
);
select throws_ok(
  format(
    $$select pg_temp.transition('00000000-0000-0000-0000-00000000f102', %L, 'accept', '{"client_action_id":"aaaaaaaa-0000-4000-8000-000000000001"}')$$,
    (select first_order from ids)
  ),
  'P0001', 'wo:forbidden', 'another employee cannot replay someone else''s action'
);
select is(
  pg_temp.transition(
    '00000000-0000-0000-0000-00000000f101', (select first_order from ids), 'comment',
    '{"comment":"Без ключа идемпотентности"}'
  ) ->> 'status',
  'accepted',
  'actions without an action id work as before'
);
select is(
  pg_temp.transition(
    '00000000-0000-0000-0000-00000000f101', (select first_order from ids), 'comment',
    '{"comment":"Без ключа идемпотентности"}'
  ) ->> 'status',
  'accepted',
  'repeated actions without an action id are not deduplicated'
);
select throws_ok(
  format(
    $$insert into public.work_order_events (work_order_id, action, payload) values (%L, 'comment', '{"client_action_id":"aaaaaaaa-0000-4000-8000-000000000001"}')$$,
    (select first_order from ids)
  ),
  '23505', null, 'the database refuses a second event with the same action id'
);

select * from finish();
rollback;
