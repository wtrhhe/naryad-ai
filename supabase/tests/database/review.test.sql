begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into public.sites (id, code, name) values ('00000000-0000-0000-0000-0000000004b1', 'RV1', 'Участок проверки');
insert into public.employees (id, personnel_number, full_name, role, specialty) values
  ('00000000-0000-0000-0000-0000000004e1', '80001', 'Слесарь Проверочный', 'worker', 'fitter'),
  ('00000000-0000-0000-0000-0000000004e2', '80002', 'Мастер Проверочный', 'master', null);
insert into public.equipment (id, site_id, name, inventory_number, equipment_type, requires_lockout) values
  ('00000000-0000-0000-0000-0000000004c1', '00000000-0000-0000-0000-0000000004b1', 'Насос П-1', 'INV-RV1', 'pump', false);
insert into public.work_orders (id, kind, priority, description, site_id, equipment_id, assignee_id, master_id, standard_hours, shift_period, status) values
  ('00000000-0000-0000-0000-0000000004d1', 'unplanned', 'normal', 'Старая течь', '00000000-0000-0000-0000-0000000004b1',
   '00000000-0000-0000-0000-0000000004c1', '00000000-0000-0000-0000-0000000004e1', '00000000-0000-0000-0000-0000000004e2', 2, 'day', 'closed'),
  ('00000000-0000-0000-0000-0000000004d2', 'unplanned', 'normal', 'Новая течь', '00000000-0000-0000-0000-0000000004b1',
   '00000000-0000-0000-0000-0000000004c1', '00000000-0000-0000-0000-0000000004e1', '00000000-0000-0000-0000-0000000004e2', 2, 'day', 'done');

insert into public.photos (id, work_order_id, kind, storage_path, mime_type, size_bytes, phash, created_at) values
  ('00000000-0000-0000-0000-0000000004f1', '00000000-0000-0000-0000-0000000004d1', 'after', 'rv/old-after.webp', 'image/webp', 1000, 'a5a5a5a5a5a5a5a5', now() - interval '10 days'),
  ('00000000-0000-0000-0000-0000000004f2', '00000000-0000-0000-0000-0000000004d1', 'before', 'rv/old-before.webp', 'image/webp', 1000, '0f0f0f0f0f0f0f0f', now() - interval '10 days'),
  ('00000000-0000-0000-0000-0000000004f3', '00000000-0000-0000-0000-0000000004d2', 'after', 'rv/new-after.webp', 'image/webp', 1000, 'a5a5a5a5a5a5a5a4', now()),
  ('00000000-0000-0000-0000-0000000004f4', '00000000-0000-0000-0000-0000000004d2', 'before', 'rv/new-before.webp', 'image/webp', 1000, 'a5a5a5a5a5a5a5a5', now() - interval '1 hour'),
  ('00000000-0000-0000-0000-0000000004f5', '00000000-0000-0000-0000-0000000004d2', 'after', 'rv/new-after-2.webp', 'image/webp', 1000, 'f0f0f0f0f0f0f0f0', now());

select results_eq(
  $$select photo_id, match_photo_id, match_order_number, distance
    from public.review_photo_matches('00000000-0000-0000-0000-0000000004d2', 6)
    where match_order_id = '00000000-0000-0000-0000-0000000004d1'$$,
  $$select '00000000-0000-0000-0000-0000000004f3'::uuid, '00000000-0000-0000-0000-0000000004f1'::uuid,
      (select number from public.work_orders where id = '00000000-0000-0000-0000-0000000004d1'), 1$$,
  'an after photo matches an older photo of another order within the Hamming distance'
);

select is(
  (select count(*)::integer from public.review_photo_matches('00000000-0000-0000-0000-0000000004d2', 6)
    where match_order_id = '00000000-0000-0000-0000-0000000004d2'),
  0,
  'photos of the same order are not reported as duplicates'
);

select is(
  (select count(*)::integer from public.review_photo_matches('00000000-0000-0000-0000-0000000004d2', 0)
    where match_order_id = '00000000-0000-0000-0000-0000000004d1'),
  0,
  'the distance threshold is respected'
);

select is(
  (select count(*)::integer from public.review_photo_matches('00000000-0000-0000-0000-0000000004d1', 16)
    where match_order_id = '00000000-0000-0000-0000-0000000004d2'),
  0,
  'newer photos are never treated as the original'
);

select ok(
  not has_function_privilege('authenticated', 'public.review_photo_matches(uuid, integer)', 'execute'),
  'signed-in users cannot call the duplicate lookup'
);

select ok(
  has_function_privilege('service_role', 'public.review_photo_matches(uuid, integer)', 'execute'),
  'the service role can call the duplicate lookup'
);

select is(
  (select command from cron.job where jobname = 'review-watcher'),
  $$select private.invoke_cron_target('reviews')$$,
  'the review watcher is scheduled'
);

select is(
  (select schedule from cron.job where jobname = 'review-watcher'),
  '* * * * *',
  'the review watcher runs every minute'
);

select * from finish();
rollback;
