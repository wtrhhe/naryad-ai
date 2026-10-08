create or replace function public.current_employee_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select e.id from public.employees e where e.auth_user_id = auth.uid() and e.is_active;
$$;

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select e.role from public.employees e where e.auth_user_id = auth.uid() and e.is_active;
$$;

create or replace function public.has_role(variadic roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_app_role() = any (roles), false);
$$;

create or replace function public.can_view_work_order(order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.work_orders w
    left join public.employees me on me.id = public.current_employee_id()
    where w.id = order_id
      and me.id is not null
      and (
        me.role in ('manager', 'admin')
        or (me.role = 'worker' and (w.assignee_id = me.id or (w.brigade_id is not null and w.brigade_id = me.brigade_id)))
        or (me.role = 'master' and (
          w.master_id = me.id
          or exists (select 1 from public.employee_sites es where es.employee_id = me.id and es.site_id = w.site_id)
        ))
      )
  );
$$;

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
    left join public.employees me on me.id = public.current_employee_id()
    where w.id = order_id
      and me.id is not null
      and w.status not in ('closed', 'cancelled')
      and (
        (me.role = 'worker' and (w.assignee_id = me.id or (w.brigade_id is not null and w.brigade_id = me.brigade_id)))
        or (me.role = 'master' and public.can_view_work_order(order_id))
      )
  );
$$;

revoke execute on function public.hit_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke execute on function public.login_lock_seconds(text, integer, integer) from public, anon, authenticated;
revoke execute on function public.record_login_attempt(text, boolean, inet) from public, anon, authenticated;
revoke execute on function public.purge_service_tables() from public, anon, authenticated;
revoke execute on function public.attach_standard_triggers(regclass, boolean) from public, anon, authenticated;

do $$
declare
  reference_table text;
begin
  foreach reference_table in array array[
    'sites', 'brigades', 'equipment', 'fault_codes', 'materials', 'material_norms', 'time_norms',
    'reason_codes', 'permit_types', 'equipment_permit_requirements', 'employee_sites'
  ]
  loop
    execute format('alter table public.%I enable row level security', reference_table);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.current_employee_id() is not null)',
      reference_table || '_read', reference_table
    );
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.has_role(''admin'')) with check (public.has_role(''admin''))',
      reference_table || '_admin_write', reference_table
    );
  end loop;
end;
$$;

alter table public.employees enable row level security;
create policy employees_read on public.employees for select to authenticated
  using (public.current_employee_id() is not null);
create policy employees_admin_write on public.employees for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

alter table public.employee_permits enable row level security;
create policy employee_permits_read on public.employee_permits for select to authenticated
  using (employee_id = public.current_employee_id() or public.has_role('master', 'manager', 'admin'));
create policy employee_permits_admin_write on public.employee_permits for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

alter table public.settings enable row level security;
create policy settings_read on public.settings for select to authenticated
  using (public.current_employee_id() is not null);
create policy settings_admin_write on public.settings for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

alter table public.work_orders enable row level security;
create policy work_orders_read on public.work_orders for select to authenticated
  using (public.can_view_work_order(id));

alter table public.work_order_events enable row level security;
create policy work_order_events_read on public.work_order_events for select to authenticated
  using (public.can_view_work_order(work_order_id));

alter table public.photos enable row level security;
create policy photos_read on public.photos for select to authenticated
  using (public.can_view_work_order(work_order_id));
create policy photos_insert on public.photos for insert to authenticated
  with check (author_id = public.current_employee_id() and public.can_contribute_to_work_order(work_order_id));

alter table public.acoustic_samples enable row level security;
create policy acoustic_samples_read on public.acoustic_samples for select to authenticated
  using (
    public.has_role('master', 'manager', 'admin')
    or (work_order_id is not null and public.can_view_work_order(work_order_id))
  );
create policy acoustic_samples_insert on public.acoustic_samples for insert to authenticated
  with check (
    recorded_by = public.current_employee_id()
    and work_order_id is not null
    and public.can_contribute_to_work_order(work_order_id)
  );

alter table public.material_writeoffs enable row level security;
create policy material_writeoffs_read on public.material_writeoffs for select to authenticated
  using (public.can_view_work_order(work_order_id));

alter table public.ai_reviews enable row level security;
create policy ai_reviews_read on public.ai_reviews for select to authenticated
  using (public.can_view_work_order(work_order_id));

alter table public.lockouts enable row level security;
create policy lockouts_read on public.lockouts for select to authenticated
  using (public.current_employee_id() is not null);

alter table public.rca_cases enable row level security;
create policy rca_cases_read on public.rca_cases for select to authenticated
  using (public.has_role('master', 'manager', 'admin'));
create policy rca_cases_master_update on public.rca_cases for update to authenticated
  using (public.has_role('master', 'admin')) with check (public.has_role('master', 'admin'));

alter table public.insights enable row level security;
create policy insights_read on public.insights for select to authenticated
  using (public.has_role('master', 'manager', 'admin'));

alter table public.rating_snapshots enable row level security;
create policy rating_snapshots_read on public.rating_snapshots for select to authenticated
  using (
    public.has_role('master', 'manager', 'admin')
    or (subject_type = 'employee' and subject_id = public.current_employee_id())
    or (subject_type = 'brigade' and subject_id = (select e.brigade_id from public.employees e where e.id = public.current_employee_id()))
  );

alter table public.notifications enable row level security;
create policy notifications_read_own on public.notifications for select to authenticated
  using (recipient_id = public.current_employee_id());
create policy notifications_mark_read on public.notifications for update to authenticated
  using (recipient_id = public.current_employee_id())
  with check (recipient_id = public.current_employee_id());

revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

alter table public.push_subscriptions enable row level security;
create policy push_subscriptions_own on public.push_subscriptions for all to authenticated
  using (employee_id = public.current_employee_id())
  with check (employee_id = public.current_employee_id());

alter table public.ai_usage enable row level security;
create policy ai_usage_admin_read on public.ai_usage for select to authenticated
  using (public.has_role('admin', 'manager'));

alter table public.audit_log enable row level security;
create policy audit_log_admin_read on public.audit_log for select to authenticated
  using (public.has_role('admin', 'manager'));

alter table public.login_attempts enable row level security;
alter table public.rate_limits enable row level security;

revoke insert, update, delete on public.work_orders, public.work_order_events, public.ai_reviews,
  public.lockouts, public.material_writeoffs, public.insights, public.rating_snapshots,
  public.ai_usage, public.audit_log from authenticated, anon;
revoke all on public.login_attempts, public.rate_limits from authenticated, anon;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('photos', 'photos', false, 10485760, array['image/webp', 'image/jpeg', 'image/png']),
  ('audio', 'audio', false, 20971520, array['audio/wav', 'audio/x-wav', 'audio/webm', 'audio/ogg', 'audio/mp4']),
  ('reports', 'reports', false, 52428800, array['application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do nothing;

create or replace function public.storage_order_id(object_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
declare
  first_segment text := split_part(object_name, '/', 1);
begin
  if first_segment ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return first_segment::uuid;
  end if;
  return null;
end;
$$;

create policy order_media_read on storage.objects for select to authenticated
  using (bucket_id in ('photos', 'audio') and public.can_view_work_order(public.storage_order_id(name)));

create policy order_media_insert on storage.objects for insert to authenticated
  with check (bucket_id in ('photos', 'audio') and public.can_contribute_to_work_order(public.storage_order_id(name)));
