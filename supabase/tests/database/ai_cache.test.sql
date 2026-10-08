begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

select has_table('public', 'ai_cache', 'ai_cache table exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.ai_cache'::regclass),
  'row level security is enabled'
);
select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'ai_cache'),
  0,
  'no policies expose the cache'
);
select ok(
  not has_table_privilege('anon', 'public.ai_cache', 'SELECT, INSERT, UPDATE, DELETE'),
  'anon has no access'
);
select ok(
  not has_table_privilege('authenticated', 'public.ai_cache', 'SELECT, INSERT, UPDATE, DELETE'),
  'authenticated has no access'
);

insert into public.ai_cache (cache_key, feature, value, model)
values ('claude:claude-sonnet-5-5:order_review:rev-1', 'order_review', '{"verdict":"ok"}', 'claude-sonnet-5-5');
insert into public.ai_cache (cache_key, feature, value, model)
values ('claude:claude-sonnet-5-5:order_review:rev-1', 'order_review', '{"verdict":"bad"}', 'claude-sonnet-5-5')
on conflict (cache_key) do update set value = excluded.value, created_at = now();

select is(
  (select value ->> 'verdict' from public.ai_cache where cache_key = 'claude:claude-sonnet-5-5:order_review:rev-1'),
  'bad',
  'upsert replaces the cached value'
);

select throws_ok(
  $$insert into public.ai_cache (cache_key, feature, value, model) values ('k', 'Bad-Feature', '{}', 'm')$$,
  '23514',
  null,
  'feature names are validated'
);

insert into public.ai_cache (cache_key, feature, value, model, created_at)
values ('mock:mock-fast:order_suggestion:old', 'order_suggestion', '"stale"', 'mock-fast', now() - interval '8 days');
select public.purge_ai_cache();

select is(
  (select count(*)::int from public.ai_cache where cache_key = 'mock:mock-fast:order_suggestion:old'),
  0,
  'purge removes entries older than seven days'
);
select is(
  (select count(*)::int from public.ai_cache where cache_key = 'claude:claude-sonnet-5-5:order_review:rev-1'),
  1,
  'purge keeps fresh entries'
);

set local role authenticated;
select throws_ok(
  $$select count(*) from public.ai_cache$$,
  '42501',
  null,
  'signed-in users cannot read the cache'
);
reset role;

select * from finish();
rollback;
