create table public.work_order_transition_rules (
  action public.work_order_action primary key,
  from_statuses public.work_order_status[] not null,
  to_status public.work_order_status,
  roles text[] not null,
  requires text[] not null default '{}',
  irreversible boolean not null default false
);

alter table public.work_order_transition_rules enable row level security;
create policy work_order_transition_rules_read on public.work_order_transition_rules for select to authenticated using (true);
revoke insert, update, delete, truncate on public.work_order_transition_rules from authenticated, anon;

insert into public.work_order_transition_rules (action, from_statuses, to_status, roles, requires, irreversible) values
  ('queue', '{issued}', 'queued', '{worker}', '{}', false),
  ('accept', '{issued,queued}', 'accepted', '{worker}', '{}', false),
  ('reject', '{issued,queued}', 'rejected', '{worker}', '{reason}', true),
  ('start', '{accepted,rework}', 'in_progress', '{worker}', '{}', false),
  ('pause', '{in_progress}', 'paused', '{worker}', '{reason}', false),
  ('resume', '{paused}', 'in_progress', '{worker}', '{}', false),
  ('complete', '{in_progress}', 'done', '{worker}', '{closing}', true),
  ('submit_review', '{done}', 'ai_review', '{master,system}', '{}', false),
  ('approve', '{ai_review}', 'closed', '{master}', '{}', true),
  ('return_rework', '{ai_review}', 'rework', '{master,system}', '{comment}', false),
  ('reassign', '{issued,queued,accepted,rejected}', 'issued', '{master}', '{assignee}', false),
  ('cancel', '{issued,queued,accepted,rejected,in_progress,paused,done,ai_review,rework}', 'cancelled', '{master}', '{reason}', true),
  ('change_priority', '{issued,queued,accepted,rejected,in_progress,paused,done,ai_review,rework}', null, '{master}', '{priority}', false),
  ('comment', '{issued,queued,accepted,rejected,in_progress,paused,done,ai_review,rework,closed,cancelled}', null, '{master,worker}', '{comment}', false);

create or replace function public.wo_raise(code text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'wo:%', code using errcode = 'P0001';
end;
$$;

create or replace function public.wo_actor()
returns table (employee_id uuid, role text, brigade_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.role::text, e.brigade_id
  from public.employees e
  where e.auth_user_id = auth.uid() and e.is_active
  union all
  select null::uuid, 'system', null::uuid
  where auth.uid() is null and coalesce(auth.role(), current_user) in ('service_role', 'postgres')
  limit 1;
$$;

create or replace function public.shift_period_at(moment timestamptz)
returns public.shift_period
language sql
immutable
set search_path = ''
as $$
  select case
    when extract(hour from moment at time zone 'Asia/Qostanay') >= 8
     and extract(hour from moment at time zone 'Asia/Qostanay') < 20 then 'day'::public.shift_period
    else 'night'::public.shift_period
  end;
$$;

create or replace function public.check_start_gate(order_id uuid, actor_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('ok', true, 'missing', '[]'::jsonb);
$$;

create or replace function public.create_work_order(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor record;
  target_equipment public.equipment;
  created public.work_orders;
  moment timestamptz := now();
begin
  select * into actor from public.wo_actor();
  if actor.role is distinct from 'master' then
    perform public.wo_raise('forbidden');
  end if;
  select * into target_equipment from public.equipment
  where id = (payload ->> 'equipment_id')::uuid and is_active;
  if not found then
    perform public.wo_raise('equipment_not_found');
  end if;
  if coalesce(payload ->> 'assignee_id', payload ->> 'brigade_id') is null then
    perform public.wo_raise('assignee_required');
  end if;
  insert into public.work_orders (
    kind, priority, description, comment, site_id, equipment_id, assignee_id, brigade_id, master_id,
    due_at, standard_hours, suggested_fault_code_id, suggested_standard_hours, suggestion,
    shift_crew, shift_period, issued_at, downtime_started_at
  ) values (
    (payload ->> 'kind')::public.work_order_type,
    (payload ->> 'priority')::public.work_order_priority,
    payload ->> 'description',
    nullif(trim(payload ->> 'comment'), ''),
    target_equipment.site_id,
    target_equipment.id,
    (payload ->> 'assignee_id')::uuid,
    (payload ->> 'brigade_id')::uuid,
    actor.employee_id,
    (payload ->> 'due_at')::timestamptz,
    (payload ->> 'standard_hours')::numeric,
    (payload ->> 'suggested_fault_code_id')::uuid,
    (payload ->> 'suggested_standard_hours')::numeric,
    payload -> 'suggestion',
    (select e.crew from public.employees e where e.id = actor.employee_id),
    public.shift_period_at(moment),
    moment,
    case when payload ->> 'kind' = 'unplanned' then moment end
  ) returning * into created;
  insert into public.work_order_events (work_order_id, actor_id, action, to_status, comment, payload, device_at)
  values (created.id, actor.employee_id, 'issue', 'issued', created.comment, payload, (payload ->> 'device_at')::timestamptz);
  return jsonb_build_object('id', created.id, 'number', created.number);
end;
$$;

create or replace function public.wo_authorize(target public.work_orders, actor_role text, actor_id uuid, actor_brigade uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if actor_role = 'system' then
    return;
  end if;
  if actor_role = 'worker'
     and (target.assignee_id = actor_id or (target.assignee_id is null and target.brigade_id = actor_brigade)) then
    return;
  end if;
  if actor_role = 'master' and (
    target.master_id = actor_id
    or exists (select 1 from public.employee_sites es where es.employee_id = actor_id and es.site_id = target.site_id)
  ) then
    return;
  end if;
  perform public.wo_raise('forbidden');
end;
$$;

create or replace function public.wo_require(target public.work_orders, requirement text, payload jsonb)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if requirement = 'reason'
     and payload ->> 'reason_code_id' is null and length(trim(coalesce(payload ->> 'reason_text', ''))) < 3 then
    perform public.wo_raise('reason_required');
  elsif requirement = 'comment' and length(trim(coalesce(payload ->> 'comment', ''))) < 2 then
    perform public.wo_raise('comment_required');
  elsif requirement = 'priority' and (payload ->> 'priority') is null then
    perform public.wo_raise('priority_required');
  elsif requirement = 'assignee' and coalesce(payload ->> 'assignee_id', payload ->> 'brigade_id') is null then
    perform public.wo_raise('assignee_required');
  elsif requirement = 'closing' then
    if length(trim(coalesce(payload ->> 'work_performed', ''))) < 3 or payload ->> 'fault_code_id' is null then
      perform public.wo_raise('closing_required');
    end if;
    if target.kind = 'unplanned'
       and not exists (select 1 from public.photos p where p.work_order_id = target.id and p.kind = 'after') then
      perform public.wo_raise('after_photo_required');
    end if;
  end if;
end;
$$;

create or replace function public.wo_save_closing(target public.work_orders, payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.material_writeoffs where work_order_id = target.id;
  insert into public.material_writeoffs (work_order_id, material_id, quantity)
  select target.id, (item ->> 'material_id')::uuid, (item ->> 'quantity')::numeric
  from jsonb_array_elements(coalesce(payload -> 'materials', '[]'::jsonb)) as item;
  update public.work_orders set
    work_performed = trim(payload ->> 'work_performed'),
    fault_code_id = (payload ->> 'fault_code_id')::uuid,
    close_comment = nullif(trim(payload ->> 'close_comment'), '')
  where id = target.id;
end;
$$;

create or replace function public.wo_renumber_queue(worker_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.work_orders w set queue_position = ranked.position
  from (
    select id, row_number() over (order by queue_position nulls last, queued_at, issued_at) as position
    from public.work_orders
    where assignee_id = worker_id and status = 'queued'
  ) ranked
  where w.id = ranked.id and w.queue_position is distinct from ranked.position;
$$;

create or replace function public.wo_apply_status(target public.work_orders, action public.work_order_action, next_status public.work_order_status, payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  moment timestamptz := now();
  cost_per_hour numeric := (select e.downtime_cost_per_hour from public.equipment e where e.id = target.equipment_id);
  ends_downtime boolean := next_status in ('closed', 'cancelled') and target.downtime_started_at is not null and target.downtime_ended_at is null;
begin
  update public.work_orders set
    status = next_status,
    queued_at = case when next_status = 'queued' then moment else queued_at end,
    queue_position = case when next_status = 'queued' then 2147483647 when action in ('accept', 'reassign', 'reject', 'cancel') then null else queue_position end,
    accepted_at = case when next_status = 'accepted' then moment when action = 'reassign' then null else accepted_at end,
    rejected_at = case when next_status = 'rejected' then moment when action = 'reassign' then null else rejected_at end,
    started_at = case when next_status = 'in_progress' then coalesce(started_at, moment) else started_at end,
    paused_at = case when next_status = 'paused' then moment when action = 'resume' then null else paused_at end,
    paused_seconds = case when action = 'resume' and paused_at is not null
      then paused_seconds + extract(epoch from moment - paused_at)::integer else paused_seconds end,
    done_at = case when next_status = 'done' then moment else done_at end,
    review_started_at = case when next_status = 'ai_review' then moment else review_started_at end,
    rework_count = case when next_status = 'rework' then rework_count + 1 else rework_count end,
    closed_at = case when next_status = 'closed' then moment else closed_at end,
    cancelled_at = case when next_status = 'cancelled' then moment else cancelled_at end,
    downtime_ended_at = case when ends_downtime then moment else downtime_ended_at end,
    downtime_cost = case when ends_downtime
      then round(extract(epoch from moment - downtime_started_at) / 3600 * cost_per_hour, 2) else downtime_cost end,
    assignee_id = case when action = 'reassign' then (payload ->> 'assignee_id')::uuid else assignee_id end,
    brigade_id = case when action = 'reassign' then (payload ->> 'brigade_id')::uuid else brigade_id end,
    priority = case when action = 'change_priority' then (payload ->> 'priority')::public.work_order_priority else priority end,
    last_comment = coalesce(nullif(trim(payload ->> 'comment'), ''), nullif(trim(payload ->> 'reason_text'), ''), last_comment)
  where id = target.id;
end;
$$;

create or replace function public.transition_work_order(order_id uuid, action public.work_order_action, payload jsonb default '{}')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor record;
  target public.work_orders;
  rule public.work_order_transition_rules;
  next_status public.work_order_status;
  requirement text;
  gate jsonb;
  event_id uuid;
  next_order uuid;
begin
  select * into actor from public.wo_actor();
  if actor.role is null then
    perform public.wo_raise('forbidden');
  end if;
  select * into target from public.work_orders w where w.id = order_id for update;
  if not found then
    perform public.wo_raise('not_found');
  end if;
  if payload ? 'expected_status' and (payload ->> 'expected_status') is distinct from target.status::text then
    perform public.wo_raise('stale_status');
  end if;
  select * into rule from public.work_order_transition_rules r where r.action = transition_work_order.action;
  if not found then
    perform public.wo_raise('invalid_transition');
  end if;
  if not (actor.role = any (rule.roles)) then
    perform public.wo_raise('forbidden');
  end if;
  if not (target.status = any (rule.from_statuses)) then
    perform public.wo_raise('invalid_transition');
  end if;
  perform public.wo_authorize(target, actor.role, actor.employee_id, actor.brigade_id);
  foreach requirement in array rule.requires loop
    perform public.wo_require(target, requirement, payload);
  end loop;
  if action = 'start' then
    gate := public.check_start_gate(target.id, actor.employee_id);
    if not coalesce((gate ->> 'ok')::boolean, false) then
      perform public.wo_raise('start_gate_blocked');
    end if;
  end if;
  if action = 'complete' then
    perform public.wo_save_closing(target, payload);
  end if;
  next_status := coalesce(rule.to_status, target.status);
  perform public.wo_apply_status(target, action, next_status, payload);
  if target.assignee_id is not null then
    perform public.wo_renumber_queue(target.assignee_id);
  end if;
  insert into public.work_order_events (
    work_order_id, actor_id, action, from_status, to_status, reason_code_id, reason_text, comment, payload, device_at
  ) values (
    target.id, actor.employee_id, action, target.status, next_status,
    (payload ->> 'reason_code_id')::uuid, nullif(trim(payload ->> 'reason_text'), ''),
    nullif(trim(payload ->> 'comment'), ''), payload - 'expected_status', (payload ->> 'device_at')::timestamptz
  ) returning id into event_id;
  if next_status in ('done', 'paused', 'rejected', 'cancelled', 'closed') and target.assignee_id is not null then
    select w.id into next_order from public.work_orders w
    where w.assignee_id = target.assignee_id and w.status = 'queued'
    order by w.queue_position limit 1;
  end if;
  return jsonb_build_object('status', next_status, 'event_id', event_id, 'next_order_id', next_order);
end;
$$;

create or replace function public.assignee_board(target_equipment_type public.equipment_type default null)
returns table (
  employee_id uuid,
  full_name text,
  specialty public.specialty,
  grade smallint,
  brigade_id uuid,
  on_shift boolean,
  active_order_id uuid,
  active_order_number bigint,
  queue_length integer,
  closed_on_type integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_role('master', 'manager', 'admin') then
    perform public.wo_raise('forbidden');
  end if;
  return query
  select
    e.id,
    e.full_name,
    e.specialty,
    e.grade,
    e.brigade_id,
    e.on_shift,
    active.id,
    active.number,
    (select count(*)::integer from public.work_orders q
      where q.assignee_id = e.id and q.status in ('queued', 'issued')),
    (select count(*)::integer from public.work_orders c
      join public.equipment eq on eq.id = c.equipment_id
      where c.assignee_id = e.id and c.status = 'closed'
        and (target_equipment_type is null or eq.equipment_type = target_equipment_type))
  from public.employees e
  left join lateral (
    select w.id, w.number from public.work_orders w
    where w.assignee_id = e.id and w.status in ('in_progress', 'paused', 'accepted', 'rework')
    order by w.started_at desc nulls last, w.accepted_at desc nulls last
    limit 1
  ) active on true
  where e.role = 'worker' and e.is_active
  order by e.on_shift desc, e.full_name;
end;
$$;

revoke execute on function public.wo_raise(text), public.wo_actor(),
  public.wo_authorize(public.work_orders, text, uuid, uuid), public.wo_require(public.work_orders, text, jsonb),
  public.wo_save_closing(public.work_orders, jsonb), public.wo_renumber_queue(uuid),
  public.wo_apply_status(public.work_orders, public.work_order_action, public.work_order_status, jsonb),
  public.check_start_gate(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.create_work_order(jsonb), public.transition_work_order(uuid, public.work_order_action, jsonb),
  public.assignee_board(public.equipment_type), public.shift_period_at(timestamptz) from public, anon;
grant execute on function public.create_work_order(jsonb), public.transition_work_order(uuid, public.work_order_action, jsonb),
  public.assignee_board(public.equipment_type), public.shift_period_at(timestamptz) to authenticated;
