begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000a001', 'w1@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000a002', 'w2@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000a003', 'm1@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000a004', 'mg@test.local', 'authenticated', 'authenticated');

insert into public.sites (id, code, name) values
  ('00000000-0000-0000-0000-0000000000b1', 'T1', 'Участок один'),
  ('00000000-0000-0000-0000-0000000000b2', 'T2', 'Участок два');

insert into public.employees (id, auth_user_id, personnel_number, full_name, role, specialty) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000a001', '90001', 'Исполнитель Один', 'worker', 'fitter'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-00000000a002', '90002', 'Исполнитель Два', 'worker', 'electrician'),
  ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-00000000a003', '90003', 'Мастер Один', 'master', null),
  ('00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-00000000a004', '90004', 'Руководитель', 'manager', null);

insert into public.employee_sites (employee_id, site_id) values
  ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000b1');

insert into public.equipment (id, site_id, name, inventory_number, equipment_type) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', 'Насос тестовый', 'INV-T1', 'pump'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b2', 'Конвейер тестовый', 'INV-T2', 'conveyor');

insert into public.work_orders (id, kind, priority, description, site_id, equipment_id, assignee_id, master_id, standard_hours, shift_period) values
  ('00000000-0000-0000-0000-0000000000d1', 'unplanned', 'emergency', 'Течь масла', '00000000-0000-0000-0000-0000000000b1',
   '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e3', 2, 'day'),
  ('00000000-0000-0000-0000-0000000000d2', 'unplanned', 'normal', 'Обрыв ленты', '00000000-0000-0000-0000-0000000000b2',
   '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e4', 3, 'night');

insert into public.notifications (recipient_id, kind, title, body) values
  ('00000000-0000-0000-0000-0000000000e1', 'order_issued', 'Новый наряд', 'Насос'),
  ('00000000-0000-0000-0000-0000000000e2', 'order_issued', 'Новый наряд', 'Конвейер');

create function pg_temp.act_as(auth_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', auth_id, 'role', 'authenticated')::text, true);
$$;

select pg_temp.act_as('00000000-0000-0000-0000-00000000a001');
set local role authenticated;
select results_eq(
  'select id from public.work_orders',
  $$values ('00000000-0000-0000-0000-0000000000d1'::uuid)$$,
  'worker sees only own work orders'
);
select is((select count(*)::int from public.notifications), 1, 'worker sees only own notifications');
select is((select count(*)::int from public.sites), 2, 'worker reads reference data');
select throws_ok(
  $$update public.work_orders set status = 'closed' where id = '00000000-0000-0000-0000-0000000000d1'$$,
  '42501', null, 'worker cannot change work order status directly'
);
select is_empty(
  $$update public.employees set role = 'admin' where id = '00000000-0000-0000-0000-0000000000e1' returning id$$,
  'worker cannot promote himself'
);
select throws_ok(
  $$insert into public.sites (code, name) values ('HACK', 'Взлом')$$,
  '42501', null, 'worker cannot write reference data'
);
select throws_ok(
  $$update public.notifications set body = 'изменено'$$,
  '42501', null, 'notification text is read only'
);
select lives_ok(
  $$update public.notifications set read_at = now()$$,
  'worker can mark own notifications read'
);
select is(
  public.can_contribute_to_work_order('00000000-0000-0000-0000-0000000000d1'),
  false,
  'worker cannot upload before accepting'
);
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000a003');
set local role authenticated;
select results_eq(
  'select id from public.work_orders',
  $$values ('00000000-0000-0000-0000-0000000000d1'::uuid)$$,
  'master sees work orders of his sites only'
);
select is(
  public.can_contribute_to_work_order('00000000-0000-0000-0000-0000000000d1'),
  true,
  'master may attach photos while issuing'
);
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000a004');
set local role authenticated;
select is((select count(*)::int from public.work_orders), 2, 'manager reads all work orders');
select throws_ok(
  $$select public.hit_rate_limit('x', 1, 60)$$,
  '42501', null, 'clients cannot call the rate limiter'
);
reset role;

set local role anon;
select throws_ok('select count(*) from public.work_orders', '42501', null, 'anonymous users have no table access');
reset role;

select is(
  public.hit_rate_limit('pgtap', 1, 60) and not public.hit_rate_limit('pgtap', 1, 60),
  true,
  'rate limiter blocks the second hit'
);

select * from finish();
rollback;
