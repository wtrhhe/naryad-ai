begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000f001', 'tw1@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000f002', 'tw2@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000f003', 'tm1@test.local', 'authenticated', 'authenticated');

insert into public.sites (id, code, name) values ('00000000-0000-0000-0000-0000000001b1', 'TT1', 'Участок теста');

insert into public.employees (id, auth_user_id, personnel_number, full_name, role, specialty) values
  ('00000000-0000-0000-0000-0000000001e1', '00000000-0000-0000-0000-00000000f001', '80001', 'Слесарь Тестов', 'worker', 'fitter'),
  ('00000000-0000-0000-0000-0000000001e2', '00000000-0000-0000-0000-00000000f002', '80002', 'Электрик Тестов', 'worker', 'electrician'),
  ('00000000-0000-0000-0000-0000000001e3', '00000000-0000-0000-0000-00000000f003', '80003', 'Мастер Тестов', 'master', null);

insert into public.employee_sites (employee_id, site_id) values
  ('00000000-0000-0000-0000-0000000001e3', '00000000-0000-0000-0000-0000000001b1');

insert into public.equipment (id, site_id, name, inventory_number, equipment_type, downtime_cost_per_hour) values
  ('00000000-0000-0000-0000-0000000001c1', '00000000-0000-0000-0000-0000000001b1', 'Насос Т-1', 'INV-TT1', 'pump', 360000);

insert into public.fault_codes (id, code, category, name, standard_hours, required_specialty) values
  ('00000000-0000-0000-0000-0000000001f1', 'М-99', 'mechanical', 'Тестовая неисправность', 2, 'fitter');

insert into public.materials (id, code, name, unit, price) values
  ('00000000-0000-0000-0000-0000000001a1', 'T-SEAL', 'Сальник тестовый', 'шт', 1500);

create function pg_temp.act_as(auth_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', auth_id, 'role', 'authenticated')::text, true);
$$;

create function pg_temp.new_order(kind text) returns uuid language plpgsql as $$
declare
  created jsonb;
begin
  perform pg_temp.act_as('00000000-0000-0000-0000-00000000f003');
  set local role authenticated;
  created := public.create_work_order(jsonb_build_object(
    'kind', kind, 'priority', 'emergency', 'description', 'Течь масла на насосе',
    'equipment_id', '00000000-0000-0000-0000-0000000001c1',
    'assignee_id', '00000000-0000-0000-0000-0000000001e1', 'standard_hours', 2
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

create temp table ids as select pg_temp.new_order('unplanned') as first_order, pg_temp.new_order('planned') as second_order;
grant select on ids to authenticated;

select is(
  (select count(*)::int from public.work_order_events e join ids on e.work_order_id = ids.first_order where e.action = 'issue'),
  1,
  'create_work_order writes the issue event'
);
select isnt((select downtime_started_at from public.work_orders w join ids on w.id = ids.first_order), null, 'unplanned order starts downtime');
select is((select site_id from public.work_orders w join ids on w.id = ids.first_order), '00000000-0000-0000-0000-0000000001b1'::uuid, 'site comes from equipment');

select pg_temp.act_as('00000000-0000-0000-0000-00000000f001');
set local role authenticated;
select throws_ok(
  $$select public.create_work_order('{"kind":"planned","priority":"normal","description":"Попытка","equipment_id":"00000000-0000-0000-0000-0000000001c1","assignee_id":"00000000-0000-0000-0000-0000000001e1","standard_hours":1}')$$,
  'P0001', 'wo:forbidden', 'workers cannot issue work orders'
);
reset role;

select throws_ok(
  format($$select pg_temp.transition('00000000-0000-0000-0000-00000000f002', %L, 'accept')$$, (select first_order from ids)),
  'P0001', 'wo:forbidden', 'another worker cannot accept someone else''s order'
);
select throws_ok(
  format($$select pg_temp.transition('00000000-0000-0000-0000-00000000f001', %L, 'reject')$$, (select first_order from ids)),
  'P0001', 'wo:reason_required', 'reject needs a reason'
);
select throws_ok(
  format($$select pg_temp.transition('00000000-0000-0000-0000-00000000f001', %L, 'start')$$, (select first_order from ids)),
  'P0001', 'wo:invalid_transition', 'cannot start before accepting'
);
select throws_ok(
  format($$select pg_temp.transition('00000000-0000-0000-0000-00000000f001', %L, 'accept', '{"expected_status":"queued"}')$$, (select first_order from ids)),
  'P0001', 'wo:stale_status', 'stale screens cannot overwrite a newer status'
);

select is(pg_temp.transition('00000000-0000-0000-0000-00000000f001', (select second_order from ids), 'queue') ->> 'status', 'queued', 'worker queues the planned order');
select is((select queue_position from public.work_orders w join ids on w.id = ids.second_order), 1, 'queued order gets position one');
select is(pg_temp.transition('00000000-0000-0000-0000-00000000f001', (select first_order from ids), 'accept') ->> 'status', 'accepted', 'worker accepts');
select isnt((select accepted_at from public.work_orders w join ids on w.id = ids.first_order), null, 'acceptance time is stored');
select is(pg_temp.transition('00000000-0000-0000-0000-00000000f001', (select first_order from ids), 'start') ->> 'status', 'in_progress', 'worker starts');
select throws_ok(
  format($$select pg_temp.transition('00000000-0000-0000-0000-00000000f001', %L, 'pause')$$, (select first_order from ids)),
  'P0001', 'wo:reason_required', 'pause needs a reason'
);
select is(
  pg_temp.transition('00000000-0000-0000-0000-00000000f001', (select first_order from ids), 'pause', '{"reason_text":"ждём подшипник со склада"}') ->> 'status',
  'paused',
  'worker pauses with a reason'
);
select is((select last_comment from public.work_orders w join ids on w.id = ids.first_order), 'ждём подшипник со склада', 'pause reason becomes the last comment');
select is(pg_temp.transition('00000000-0000-0000-0000-00000000f001', (select first_order from ids), 'resume') ->> 'status', 'in_progress', 'worker resumes');

select throws_ok(
  format($$select pg_temp.transition('00000000-0000-0000-0000-00000000f001', %L, 'complete', '{"work_performed":"Заменил сальник","fault_code_id":"00000000-0000-0000-0000-0000000001f1"}')$$, (select first_order from ids)),
  'P0001', 'wo:after_photo_required', 'unplanned work needs an after photo'
);

insert into public.photos (work_order_id, kind, storage_path, mime_type, size_bytes)
select first_order, 'after', first_order::text || '/after.webp', 'image/webp', 1000 from ids;

select is(
  pg_temp.transition(
    '00000000-0000-0000-0000-00000000f001', (select first_order from ids), 'complete',
    '{"work_performed":"Заменил сальник","fault_code_id":"00000000-0000-0000-0000-0000000001f1","materials":[{"material_id":"00000000-0000-0000-0000-0000000001a1","quantity":2}]}'
  ) ->> 'next_order_id',
  (select second_order::text from ids),
  'completion suggests the next queued order'
);
select is((select quantity from public.material_writeoffs m join ids on m.work_order_id = ids.first_order), 2.000, 'materials are written off');

select throws_ok(
  format($$select pg_temp.transition('00000000-0000-0000-0000-00000000f001', %L, 'submit_review')$$, (select first_order from ids)),
  'P0001', 'wo:forbidden', 'workers cannot send their own work to review'
);
select is(pg_temp.transition('00000000-0000-0000-0000-00000000f003', (select first_order from ids), 'submit_review') ->> 'status', 'ai_review', 'master sends to review');
select is(pg_temp.transition('00000000-0000-0000-0000-00000000f003', (select first_order from ids), 'approve') ->> 'status', 'closed', 'master closes');
select isnt((select downtime_cost from public.work_orders w join ids on w.id = ids.first_order), null, 'closing fixes the downtime cost');

select * from finish();
rollback;
