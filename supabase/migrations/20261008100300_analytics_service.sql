create table public.rca_cases (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipment (id) on delete cascade,
  fault_code_id uuid references public.fault_codes (id) on delete set null,
  related_order_ids uuid[] not null default '{}',
  five_whys jsonb not null default '[]',
  root_cause text,
  recommendation text,
  status public.rca_status not null default 'open',
  owner_id uuid references public.employees (id) on delete set null,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index rca_cases_equipment_idx on public.rca_cases (equipment_id, status);
create unique index rca_cases_one_open_per_fault_idx on public.rca_cases (equipment_id, fault_code_id)
  where status <> 'closed';

create table public.insights (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind ~ '^[a-z_]{2,60}$'),
  entity_type text check (entity_type in ('equipment', 'site', 'employee', 'brigade', 'shift', 'material')),
  entity_id uuid,
  severity smallint not null default 2 check (severity between 1 and 3),
  metrics jsonb not null default '{}',
  summary text not null,
  recommendation text,
  generated_by_llm boolean not null default false,
  period_start timestamptz not null,
  period_end timestamptz not null,
  created_at timestamptz not null default now(),
  constraint insights_period check (period_start <= period_end)
);

create index insights_created_idx on public.insights (created_at desc);
create index insights_entity_idx on public.insights (entity_type, entity_id);

create table public.rating_snapshots (
  id uuid primary key default gen_random_uuid(),
  subject_type public.rating_subject not null,
  subject_id uuid not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  score numeric(5, 2) not null check (score between 0 and 100),
  components jsonb not null,
  explanation text,
  created_at timestamptz not null default now(),
  unique (subject_type, subject_id, period_start, period_end),
  constraint rating_snapshots_period check (period_start <= period_end)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.employees (id) on delete cascade,
  kind text not null check (kind ~ '^[a-z_]{2,40}$'),
  title text not null check (length(title) <= 200),
  body text not null check (length(body) <= 2000),
  work_order_id uuid references public.work_orders (id) on delete cascade,
  payload jsonb not null default '{}',
  is_urgent boolean not null default false,
  dedupe_key text unique,
  read_at timestamptz,
  push_sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
create index notifications_unread_idx on public.notifications (recipient_id) where read_at is null;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://'),
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index push_subscriptions_employee_idx on public.push_subscriptions (employee_id);

create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  feature text not null check (feature ~ '^[a-z_]{2,60}$'),
  provider text not null,
  model text not null,
  work_order_id uuid references public.work_orders (id) on delete set null,
  cache_key text,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cache_read_tokens integer not null default 0 check (cache_read_tokens >= 0),
  cost_usd numeric(12, 6) not null default 0 check (cost_usd >= 0),
  duration_ms integer check (duration_ms >= 0),
  success boolean not null,
  error text,
  created_at timestamptz not null default now()
);

create index ai_usage_created_idx on public.ai_usage (created_at desc);
create index ai_usage_cache_key_idx on public.ai_usage (cache_key) where cache_key is not null;

create table public.login_attempts (
  id bigint generated always as identity primary key,
  personnel_number text not null,
  success boolean not null,
  ip inet,
  attempted_at timestamptz not null default now()
);

create index login_attempts_number_idx on public.login_attempts (personnel_number, attempted_at desc);

create table public.rate_limits (
  bucket text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket, window_start)
);

select public.attach_standard_triggers('public.rca_cases');

create or replace function public.hit_rate_limit(bucket text, max_hits integer, window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_window timestamptz := to_timestamp(floor(extract(epoch from now()) / window_seconds) * window_seconds);
  total integer;
begin
  if max_hits < 1 or window_seconds < 1 then
    raise exception 'invalid rate limit parameters' using errcode = '22023';
  end if;
  insert into public.rate_limits as r (bucket, window_start, hits)
  values (hit_rate_limit.bucket, current_window, 1)
  on conflict (bucket, window_start) do update set hits = r.hits + 1
  returning hits into total;
  return total <= max_hits;
end;
$$;

create or replace function public.login_lock_seconds(number text, max_failures integer default 5, lock_minutes integer default 5)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  with recent as (
    select success, attempted_at
    from public.login_attempts
    where personnel_number = number
      and attempted_at > now() - make_interval(mins => lock_minutes)
    order by attempted_at desc
    limit max_failures
  ),
  streak as (
    select count(*) filter (where not success) as failures,
           bool_and(not success) as all_failed,
           min(attempted_at) as oldest
    from recent
  )
  select case
    when failures >= max_failures and all_failed
      then greatest(0, ceil(extract(epoch from (oldest + make_interval(mins => lock_minutes) - now())))::integer)
    else 0
  end
  from streak;
$$;

create or replace function public.record_login_attempt(number text, succeeded boolean, client_ip inet default null)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.login_attempts (personnel_number, success, ip) values (number, succeeded, client_ip);
$$;

create or replace function public.purge_service_tables()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.rate_limits where window_start < now() - interval '1 day';
  delete from public.login_attempts where attempted_at < now() - interval '30 days';
$$;

select cron.schedule('purge-service-tables', '17 3 * * *', 'select public.purge_service_tables()');
