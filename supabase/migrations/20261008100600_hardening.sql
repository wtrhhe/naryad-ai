create or replace function public.hit_rate_limit(bucket text, max_hits integer, window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_window timestamptz;
  total integer;
begin
  if max_hits < 1 or window_seconds < 1 then
    raise exception 'invalid rate limit parameters' using errcode = '22023';
  end if;
  current_window := to_timestamp(floor(extract(epoch from now()) / window_seconds) * window_seconds);
  insert into public.rate_limits as r (bucket, window_start, hits)
  values (hit_rate_limit.bucket, current_window, 1)
  on conflict on constraint rate_limits_pkey do update set hits = r.hits + 1
  returning r.hits into total;
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
           max(attempted_at) as newest
    from recent
  )
  select case
    when failures >= max_failures and all_failed
      then greatest(0, ceil(extract(epoch from (newest + make_interval(mins => lock_minutes) - now())))::integer)
    else 0
  end
  from streak;
$$;

create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into public.audit_log (table_name, record_id, action, actor_auth_id, old_data, new_data)
  values (
    tg_table_name,
    coalesce(row_data ->> 'id', row_data ->> 'key', row_data ->> 'employee_id'),
    tg_op,
    auth.uid(),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return null;
end;
$$;

revoke all on all tables in schema public from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon;
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke truncate, references, trigger on tables from authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from anon, public;
revoke execute on function public.write_audit_log(), public.set_updated_at() from public, anon, authenticated;

create or replace function public.current_brigade_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select e.brigade_id from public.employees e where e.auth_user_id = auth.uid() and e.is_active;
$$;

revoke execute on function public.current_brigade_id() from public, anon;
grant execute on function public.current_brigade_id() to authenticated;

create or replace function public.can_contribute_to_work_order(order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.work_orders w
    join public.employees me on me.id = public.current_employee_id()
    where w.id = order_id
      and (
        (me.role = 'worker'
          and w.status in ('accepted', 'in_progress', 'paused', 'done', 'rework')
          and (w.assignee_id = me.id or (w.brigade_id is not null and w.brigade_id = me.brigade_id)))
        or (me.role = 'master'
          and w.status not in ('closed', 'cancelled')
          and public.can_view_work_order(order_id))
      )
  );
$$;

drop policy work_orders_read on public.work_orders;
create policy work_orders_read on public.work_orders for select to authenticated using (
  (select public.current_app_role()) in ('manager', 'admin')
  or (
    (select public.current_app_role()) = 'worker'
    and (assignee_id = (select public.current_employee_id()) or brigade_id = (select public.current_brigade_id()))
  )
  or (
    (select public.current_app_role()) = 'master'
    and (
      master_id = (select public.current_employee_id())
      or site_id in (select es.site_id from public.employee_sites es where es.employee_id = (select public.current_employee_id()))
    )
  )
);

drop policy work_order_events_read on public.work_order_events;
create policy work_order_events_read on public.work_order_events for select to authenticated
  using (work_order_id in (select w.id from public.work_orders w));

drop policy photos_read on public.photos;
create policy photos_read on public.photos for select to authenticated
  using (work_order_id in (select w.id from public.work_orders w));

drop policy ai_reviews_read on public.ai_reviews;
create policy ai_reviews_read on public.ai_reviews for select to authenticated
  using (work_order_id in (select w.id from public.work_orders w));

drop policy material_writeoffs_read on public.material_writeoffs;
create policy material_writeoffs_read on public.material_writeoffs for select to authenticated
  using (work_order_id in (select w.id from public.work_orders w));

drop policy photos_insert on public.photos;
create policy photos_insert on public.photos for insert to authenticated with check (
  author_id = (select public.current_employee_id())
  and ghost_score is null
  and storage_path like work_order_id::text || '/%'
  and exists (select 1 from storage.objects o where o.bucket_id = 'photos' and o.name = storage_path)
  and public.can_contribute_to_work_order(work_order_id)
);

drop policy acoustic_samples_insert on public.acoustic_samples;
create policy acoustic_samples_insert on public.acoustic_samples for insert to authenticated with check (
  recorded_by = (select public.current_employee_id())
  and work_order_id is not null
  and (
    storage_path is null
    or (
      storage_path like work_order_id::text || '/%'
      and exists (select 1 from storage.objects o where o.bucket_id = 'audio' and o.name = storage_path)
    )
  )
  and public.can_contribute_to_work_order(work_order_id)
);

drop policy lockouts_read on public.lockouts;
create policy lockouts_read on public.lockouts for select to authenticated using (
  (select public.current_app_role()) in ('master', 'manager', 'admin')
  or work_order_id in (select w.id from public.work_orders w)
);

revoke update on public.rca_cases from authenticated;
grant update (root_cause, recommendation, five_whys, status, owner_id, closed_at) on public.rca_cases to authenticated;

alter table public.push_subscriptions add constraint push_subscriptions_endpoint_allowlist
  check (endpoint ~ '^https://([a-z0-9-]+\.)*(googleapis\.com|mozilla\.com|push\.apple\.com|notify\.windows\.com)/');

drop index public.rca_cases_one_open_per_fault_idx;
create unique index rca_cases_one_open_per_fault_idx on public.rca_cases (equipment_id, fault_code_id)
  nulls not distinct where status <> 'closed';

alter table public.work_orders drop constraint work_orders_downtime_order;
alter table public.work_orders add constraint work_orders_downtime_order check (
  downtime_ended_at is null or (downtime_started_at is not null and downtime_started_at <= downtime_ended_at)
);

do $$
declare
  reference_table text;
begin
  foreach reference_table in array array[
    'sites', 'brigades', 'equipment', 'fault_codes', 'materials', 'material_norms', 'time_norms',
    'reason_codes', 'permit_types', 'equipment_permit_requirements', 'employee_sites', 'employees',
    'employee_permits', 'settings'
  ]
  loop
    execute format('drop policy %I on public.%I', reference_table || '_admin_write', reference_table);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select public.has_role(''admin'')))',
      reference_table || '_admin_insert', reference_table
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select public.has_role(''admin''))) with check ((select public.has_role(''admin'')))',
      reference_table || '_admin_update', reference_table
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using ((select public.has_role(''admin'')))',
      reference_table || '_admin_delete', reference_table
    );
  end loop;

  foreach reference_table in array array[
    'sites', 'brigades', 'equipment', 'fault_codes', 'materials', 'material_norms', 'time_norms',
    'reason_codes', 'permit_types', 'equipment_permit_requirements', 'employee_sites', 'employees', 'settings'
  ]
  loop
    execute format('drop policy %I on public.%I', reference_table || '_read', reference_table);
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select public.current_employee_id()) is not null)',
      reference_table || '_read', reference_table
    );
  end loop;
end;
$$;

drop index public.work_orders_master_idx;
drop index public.work_orders_brigade_idx;
create index work_orders_master_issued_idx on public.work_orders (master_id, issued_at desc);
create index work_orders_brigade_issued_idx on public.work_orders (brigade_id, issued_at desc) where brigade_id is not null;
create index work_orders_assignee_issued_idx on public.work_orders (assignee_id, issued_at desc);
create index notifications_work_order_idx on public.notifications (work_order_id) where work_order_id is not null;
create index lockouts_work_order_idx on public.lockouts (work_order_id);
create index lockouts_equipment_idx on public.lockouts (equipment_id);
create index ai_usage_work_order_idx on public.ai_usage (work_order_id) where work_order_id is not null;
create index brigades_site_idx on public.brigades (site_id);
create index employee_permits_type_idx on public.employee_permits (permit_type_id);
create index rca_cases_fault_code_idx on public.rca_cases (fault_code_id);
