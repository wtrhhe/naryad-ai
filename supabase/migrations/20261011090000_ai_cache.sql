create table public.ai_cache (
  cache_key text primary key check (char_length(cache_key) between 1 and 512),
  feature text not null check (feature ~ '^[a-z_]{2,60}$'),
  value jsonb not null,
  model text not null,
  created_at timestamptz not null default now()
);

create index ai_cache_created_idx on public.ai_cache (created_at);

alter table public.ai_cache enable row level security;
revoke all on public.ai_cache from public, anon, authenticated;

create or replace function public.purge_ai_cache()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.ai_cache where created_at < now() - interval '7 days';
$$;

revoke execute on function public.purge_ai_cache() from public, anon, authenticated;

select cron.schedule('purge-ai-cache', '29 3 * * *', 'select public.purge_ai_cache()');
