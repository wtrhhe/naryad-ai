begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000f101', 'rw1@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000f102', 'rw2@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000f103', 'rw3@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000f104', 'rm1@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000f105', 'nobody@test.local', 'authenticated', 'authenticated');

insert into public.sites (id, code, name) values ('00000000-0000-0000-0000-0000000005b1', 'RT1', 'Участок рейтинга');
insert into public.brigades (id, name, site_id) values
  ('00000000-0000-0000-0000-0000000005a1', 'Бригада рейтинга А', '00000000-0000-0000-0000-0000000005b1'),
  ('00000000-0000-0000-0000-0000000005a2', 'Бригада рейтинга Б', '00000000-0000-0000-0000-0000000005b1');
insert into public.employees (id, auth_user_id, personnel_number, full_name, role, specialty, brigade_id) values
  ('00000000-0000-0000-0000-0000000005e1', '00000000-0000-0000-0000-00000000f101', '85001', 'Слесарь Первый', 'worker', 'fitter', '00000000-0000-0000-0000-0000000005a1'),
  ('00000000-0000-0000-0000-0000000005e2', '00000000-0000-0000-0000-00000000f102', '85002', 'Слесарь Второй', 'worker', 'fitter', '00000000-0000-0000-0000-0000000005a1'),
  ('00000000-0000-0000-0000-0000000005e3', '00000000-0000-0000-0000-00000000f103', '85003', 'Слесарь Чужой', 'worker', 'fitter', '00000000-0000-0000-0000-0000000005a2'),
  ('00000000-0000-0000-0000-0000000005e4', '00000000-0000-0000-0000-00000000f104', '85004', 'Мастер Рейтинга', 'master', null, null);
insert into public.equipment (id, site_id, name, inventory_number, equipment_type) values
  ('00000000-0000-0000-0000-0000000005c1', '00000000-0000-0000-0000-0000000005b1', 'Насос Р-1', 'INV-RT1', 'pump'),
  ('00000000-0000-0000-0000-0000000005c2', '00000000-0000-0000-0000-0000000005b1', 'Конвейер Р-2', 'INV-RT2', 'conveyor');
insert into public.fault_codes (id, code, category, name, standard_hours, required_specialty) values
  ('00000000-0000-0000-0000-0000000005f1', 'С-97', 'mechanical', 'Тестовая неисправность', 3.5, 'fitter');
insert into public.reason_codes (id, kind, code, label, is_valid_excuse) values
  ('00000000-0000-0000-0000-000000000591', 'reject', 'rating_test_lazy', 'Без причины', false),
  ('00000000-0000-0000-0000-000000000592', 'reject', 'rating_test_sick', 'Болезнь', true);

insert into public.work_orders (id, kind, priority, status, description, site_id, equipment_id, assignee_id, master_id,
  due_at, standard_hours, fault_code_id, shift_period, issued_at, done_at, closed_at, rework_count) values
  ('00000000-0000-0000-0000-0000000005d1', 'unplanned', 'high', 'closed', 'Течь сальника', '00000000-0000-0000-0000-0000000005b1',
   '00000000-0000-0000-0000-0000000005c1', '00000000-0000-0000-0000-0000000005e1', '00000000-0000-0000-0000-0000000005e4',
   '2031-03-02 12:00+00', 2, null, 'day', '2031-03-02 06:00+00', '2031-03-02 10:00+00', '2031-03-02 11:00+00', 0),
  ('00000000-0000-0000-0000-0000000005d2', 'unplanned', 'normal', 'closed', 'Вибрация', '00000000-0000-0000-0000-0000000005b1',
   '00000000-0000-0000-0000-0000000005c2', '00000000-0000-0000-0000-0000000005e2', '00000000-0000-0000-0000-0000000005e4',
   '2031-03-03 12:00+00', null, '00000000-0000-0000-0000-0000000005f1', 'day', '2031-03-03 06:00+00', '2031-03-03 13:00+00', '2031-03-03 14:00+00', 1),
  ('00000000-0000-0000-0000-0000000005d3', 'planned', 'planned', 'closed', 'Смазка', '00000000-0000-0000-0000-0000000005b1',
   '00000000-0000-0000-0000-0000000005c2', '00000000-0000-0000-0000-0000000005e3', '00000000-0000-0000-0000-0000000005e4',
   null, 1.5, null, 'day', '2031-03-04 06:00+00', '2031-03-04 08:00+00', '2031-03-04 09:00+00', 0),
  ('00000000-0000-0000-0000-0000000005d4', 'unplanned', 'high', 'issued', 'Снова течь', '00000000-0000-0000-0000-0000000005b1',
   '00000000-0000-0000-0000-0000000005c1', '00000000-0000-0000-0000-0000000005e3', '00000000-0000-0000-0000-0000000005e4',
   null, 2, null, 'day', '2031-03-09 06:00+00', null, null, 0),
  ('00000000-0000-0000-0000-0000000005d5', 'unplanned', 'high', 'issued', 'Поздняя течь', '00000000-0000-0000-0000-0000000005b1',
   '00000000-0000-0000-0000-0000000005c1', '00000000-0000-0000-0000-0000000005e3', '00000000-0000-0000-0000-0000000005e4',
   null, 2, null, 'day', '2031-03-20 06:00+00', null, null, 0);

insert into public.ai_reviews (work_order_id, revision, verdict, score, master_score, master_comment) values
  ('00000000-0000-0000-0000-0000000005d1', 0, 'accepted', 70, 90, 'Работа выполнена чисто'),
  ('00000000-0000-0000-0000-0000000005d2', 0, 'rework', 40, null, null),
  ('00000000-0000-0000-0000-0000000005d2', 1, 'accepted', 75, null, null);

insert into public.work_order_events (work_order_id, actor_id, action, from_status, to_status, reason_code_id, occurred_at) values
  ('00000000-0000-0000-0000-0000000005d4', '00000000-0000-0000-0000-0000000005e1', 'reject', 'issued', 'rejected',
   '00000000-0000-0000-0000-000000000591', '2031-03-02 07:00+00'),
  ('00000000-0000-0000-0000-0000000005d4', '00000000-0000-0000-0000-0000000005e3', 'reject', 'issued', 'rejected',
   '00000000-0000-0000-0000-000000000592', '2031-03-03 07:00+00');

create function pg_temp.as_user(auth_id uuid, statement text) returns setof jsonb language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', auth_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  return query execute format('select to_jsonb(r) from (%s) r', statement);
  reset role;
end;
$$;

create function pg_temp.facts_for(auth_id uuid) returns setof uuid language sql as $$
  select (row ->> 'order_id')::uuid
  from pg_temp.as_user(auth_id, $q$select * from public.rating_facts('2031-03-01', '2031-03-08')$q$) row;
$$;

select set_eq(
  $$select pg_temp.facts_for('00000000-0000-0000-0000-00000000f104')$$,
  $$values ('00000000-0000-0000-0000-0000000005d1'::uuid), ('00000000-0000-0000-0000-0000000005d2'), ('00000000-0000-0000-0000-0000000005d3')$$,
  'master sees every closed order of the period'
);
reset role;
select set_eq(
  $$select pg_temp.facts_for('00000000-0000-0000-0000-00000000f101')$$,
  $$values ('00000000-0000-0000-0000-0000000005d1'::uuid), ('00000000-0000-0000-0000-0000000005d2')$$,
  'worker sees own and own brigade facts only'
);
reset role;
select set_eq(
  $$select pg_temp.facts_for('00000000-0000-0000-0000-00000000f103')$$,
  $$values ('00000000-0000-0000-0000-0000000005d3'::uuid)$$,
  'worker cannot see facts of another brigade'
);
reset role;

select is(
  (select (row ->> 'score')::int from pg_temp.as_user('00000000-0000-0000-0000-00000000f104',
    $$select * from public.rating_facts('2031-03-01', '2031-03-08') where order_id = '00000000-0000-0000-0000-0000000005d1'$$) row),
  90,
  'master score overrides the AI score'
);
reset role;
select is(
  (select (row ->> 'score')::int from pg_temp.as_user('00000000-0000-0000-0000-00000000f104',
    $$select * from public.rating_facts('2031-03-01', '2031-03-08') where order_id = '00000000-0000-0000-0000-0000000005d2'$$) row),
  75,
  'latest review revision wins'
);
reset role;
select is(
  (select (row ->> 'standard_hours')::numeric from pg_temp.as_user('00000000-0000-0000-0000-00000000f104',
    $$select * from public.rating_facts('2031-03-01', '2031-03-08') where order_id = '00000000-0000-0000-0000-0000000005d2'$$) row),
  3.5,
  'standard hours fall back to the fault code norm'
);
reset role;
select is(
  (select (row ->> 'brigade_id')::uuid from pg_temp.as_user('00000000-0000-0000-0000-00000000f104',
    $$select * from public.rating_facts('2031-03-01', '2031-03-08') where order_id = '00000000-0000-0000-0000-0000000005d3'$$) row),
  '00000000-0000-0000-0000-0000000005a2'::uuid,
  'brigade comes from the assignee'
);
reset role;

select set_eq(
  $$select (row ->> 'order_id')::uuid from pg_temp.as_user('00000000-0000-0000-0000-00000000f104',
    $q$select * from public.rating_follow_ups('2031-03-01', '2031-03-08')$q$) row$$,
  $$values ('00000000-0000-0000-0000-0000000005d1'::uuid), ('00000000-0000-0000-0000-0000000005d2'), ('00000000-0000-0000-0000-0000000005d4')$$,
  'follow-ups cover unplanned orders up to seven days after the period'
);
reset role;
select set_eq(
  $$select (row ->> 'order_id')::uuid from pg_temp.as_user('00000000-0000-0000-0000-00000000f103',
    $q$select * from public.rating_follow_ups('2031-03-01', '2031-03-08')$q$) row$$,
  $$values ('00000000-0000-0000-0000-0000000005d2'::uuid)$$,
  'worker sees follow-ups only on equipment of own facts'
);
reset role;

select set_eq(
  $$select (row ->> 'is_valid_excuse')::boolean from pg_temp.as_user('00000000-0000-0000-0000-00000000f101',
    $q$select * from public.rating_refusals('2031-03-01', '2031-03-08')$q$) row$$,
  $$values (false)$$,
  'worker sees only own brigade refusals with the excuse flag'
);
reset role;
select is(
  (select count(*)::int from pg_temp.as_user('00000000-0000-0000-0000-00000000f104',
    $q$select * from public.rating_refusals('2031-03-01', '2031-03-08')$q$) row),
  2,
  'master sees every refusal'
);
reset role;

select throws_ok(
  $$select * from pg_temp.as_user('00000000-0000-0000-0000-00000000f105', $q$select * from public.rating_facts('2031-03-01', '2031-03-08')$q$)$$,
  '42501', 'rating:forbidden', 'user without an employee profile is rejected'
);
reset role;
select throws_ok(
  $$select * from pg_temp.as_user('00000000-0000-0000-0000-00000000f104', $q$select * from public.rating_facts('2031-03-08', '2031-03-01')$q$)$$,
  '22023', 'rating:invalid_period', 'reversed period is rejected'
);
reset role;

set local role anon;
select throws_ok(
  $$select * from public.rating_facts('2031-03-01', '2031-03-08')$$,
  '42501', null, 'anonymous callers cannot read rating facts'
);
reset role;

select * from finish();
rollback;
