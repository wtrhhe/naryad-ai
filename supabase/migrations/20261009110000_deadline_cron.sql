create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.cron_targets (
  name text primary key check (name ~ '^[a-z_]{2,40}$'),
  url text not null check (url ~ '^https?://'),
  secret text not null check (length(secret) >= 32),
  updated_at timestamptz not null default now()
);

create or replace function private.invoke_cron_target(target text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  config private.cron_targets;
begin
  select * into config from private.cron_targets where name = target;
  if not found then
    return;
  end if;
  perform net.http_post(
    url := config.url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || config.secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
end;
$$;

create or replace function public.configure_cron_target(target text, target_url text, target_secret text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.cron_targets (name, url, secret) values (target, target_url, target_secret)
  on conflict (name) do update set url = excluded.url, secret = excluded.secret, updated_at = now();
$$;

revoke execute on function private.invoke_cron_target(text) from public, anon, authenticated;
revoke execute on function public.configure_cron_target(text, text, text) from public, anon, authenticated;
grant execute on function public.configure_cron_target(text, text, text) to service_role;

select cron.schedule('deadline-watcher', '* * * * *', $$select private.invoke_cron_target('deadlines')$$);
