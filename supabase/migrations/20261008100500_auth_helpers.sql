create or replace function public.login_recent_failures(number text, lock_minutes integer default 5)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.login_attempts a
  where a.personnel_number = number
    and not a.success
    and a.attempted_at > now() - make_interval(mins => lock_minutes)
    and a.attempted_at > coalesce(
      (select max(s.attempted_at) from public.login_attempts s where s.personnel_number = number and s.success),
      '-infinity'::timestamptz
    );
$$;

revoke execute on function public.login_recent_failures(text, integer) from public, anon, authenticated;
