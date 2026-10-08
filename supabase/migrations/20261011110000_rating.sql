create or replace function public.rating_viewer(period_start timestamptz, period_end timestamptz)
returns table (employee_id uuid, role text, brigade_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  actor record;
begin
  if period_start is null or period_end is null or period_end <= period_start
     or period_end - period_start > interval '400 days' then
    raise exception 'rating:invalid_period' using errcode = '22023';
  end if;
  select a.employee_id, a.role, a.brigade_id into actor from public.wo_actor() a limit 1;
  if actor.role is null or actor.role not in ('master', 'manager', 'admin', 'worker', 'system') then
    raise exception 'rating:forbidden' using errcode = '42501';
  end if;
  return query select actor.employee_id, actor.role, actor.brigade_id;
end;
$$;

create or replace function public.rating_facts(period_start timestamptz, period_end timestamptz)
returns table (
  order_id uuid,
  order_number bigint,
  assignee_id uuid,
  brigade_id uuid,
  site_id uuid,
  equipment_id uuid,
  equipment_name text,
  fault_code_id uuid,
  fault_code text,
  priority public.work_order_priority,
  kind public.work_order_type,
  closed_at timestamptz,
  due_at timestamptz,
  done_at timestamptz,
  standard_hours numeric,
  score integer,
  rework_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  viewer record;
begin
  select v.employee_id, v.role, v.brigade_id into viewer
  from public.rating_viewer(period_start, period_end) v;
  return query
  select
    w.id,
    w.number,
    w.assignee_id,
    coalesce(a.brigade_id, w.brigade_id),
    w.site_id,
    w.equipment_id,
    eq.name,
    w.fault_code_id,
    fc.code,
    w.priority,
    w.kind,
    w.closed_at,
    w.due_at,
    w.done_at,
    coalesce(w.standard_hours, fc.standard_hours, 1)::numeric,
    review.final_score,
    w.rework_count
  from public.work_orders w
  left join public.employees a on a.id = w.assignee_id
  join public.equipment eq on eq.id = w.equipment_id
  left join public.fault_codes fc on fc.id = w.fault_code_id
  left join lateral (
    select coalesce(r.master_score, r.score)::integer as final_score
    from public.ai_reviews r
    where r.work_order_id = w.id and coalesce(r.master_score, r.score) is not null
    order by r.revision desc, r.created_at desc
    limit 1
  ) review on true
  where w.status = 'closed'
    and w.closed_at >= period_start
    and w.closed_at < period_end
    and (
      viewer.role <> 'worker'
      or w.assignee_id = viewer.employee_id
      or (viewer.brigade_id is not null and coalesce(a.brigade_id, w.brigade_id) = viewer.brigade_id)
    )
  order by w.closed_at desc;
end;
$$;

create or replace function public.rating_follow_ups(period_start timestamptz, period_end timestamptz)
returns table (
  order_id uuid,
  equipment_id uuid,
  fault_code_id uuid,
  issued_at timestamptz,
  kind public.work_order_type
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  viewer record;
begin
  select v.employee_id, v.role, v.brigade_id into viewer
  from public.rating_viewer(period_start, period_end) v;
  return query
  select w.id, w.equipment_id, coalesce(w.fault_code_id, w.suggested_fault_code_id), w.issued_at, w.kind
  from public.work_orders w
  where w.kind = 'unplanned'
    and w.status <> 'cancelled'
    and w.issued_at >= period_start
    and w.issued_at <= period_end + interval '7 days'
    and (
      viewer.role <> 'worker'
      or w.equipment_id in (
        select c.equipment_id
        from public.work_orders c
        left join public.employees ca on ca.id = c.assignee_id
        where c.status = 'closed'
          and c.closed_at >= period_start
          and c.closed_at < period_end
          and (
            c.assignee_id = viewer.employee_id
            or (viewer.brigade_id is not null and coalesce(ca.brigade_id, c.brigade_id) = viewer.brigade_id)
          )
      )
    )
  order by w.issued_at;
end;
$$;

create or replace function public.rating_refusals(period_start timestamptz, period_end timestamptz)
returns table (
  event_id uuid,
  work_order_id uuid,
  employee_id uuid,
  brigade_id uuid,
  occurred_at timestamptz,
  reason_code text,
  is_valid_excuse boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  viewer record;
begin
  select v.employee_id, v.role, v.brigade_id into viewer
  from public.rating_viewer(period_start, period_end) v;
  return query
  select ev.id, ev.work_order_id, ev.actor_id, e.brigade_id, ev.occurred_at, rc.code, coalesce(rc.is_valid_excuse, false)
  from public.work_order_events ev
  join public.employees e on e.id = ev.actor_id
  left join public.reason_codes rc on rc.id = ev.reason_code_id
  where ev.action = 'reject'
    and ev.occurred_at >= period_start
    and ev.occurred_at < period_end
    and (
      viewer.role <> 'worker'
      or ev.actor_id = viewer.employee_id
      or (viewer.brigade_id is not null and e.brigade_id = viewer.brigade_id)
    )
  order by ev.occurred_at;
end;
$$;

create index if not exists work_orders_closed_at_idx on public.work_orders (closed_at) where status = 'closed';
create index if not exists work_order_events_reject_idx on public.work_order_events (occurred_at) where action = 'reject';

revoke execute on function public.rating_viewer(timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function public.rating_facts(timestamptz, timestamptz), public.rating_follow_ups(timestamptz, timestamptz),
  public.rating_refusals(timestamptz, timestamptz) from public, anon;
grant execute on function public.rating_facts(timestamptz, timestamptz), public.rating_follow_ups(timestamptz, timestamptz),
  public.rating_refusals(timestamptz, timestamptz) to authenticated, service_role;
