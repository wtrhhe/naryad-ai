create unique index work_order_events_client_action_idx
  on public.work_order_events ((payload ->> 'client_action_id'))
  where (payload ->> 'client_action_id') is not null;

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
  applied public.work_order_events;
begin
  select * into actor from public.wo_actor();
  if actor.role is null then
    perform public.wo_raise('forbidden');
  end if;
  select * into target from public.work_orders w where w.id = order_id for update;
  if not found then
    perform public.wo_raise('not_found');
  end if;
  if (transition_work_order.payload ->> 'client_action_id') is not null then
    select * into applied from public.work_order_events e
    where (e.payload ->> 'client_action_id') = (transition_work_order.payload ->> 'client_action_id');
    if found then
      if applied.actor_id is distinct from actor.employee_id then
        perform public.wo_raise('forbidden');
      end if;
      if applied.work_order_id is distinct from target.id or applied.action is distinct from transition_work_order.action then
        perform public.wo_raise('invalid_transition');
      end if;
      if applied.to_status in ('done', 'paused', 'rejected', 'cancelled', 'closed') and target.assignee_id is not null then
        select w.id into next_order from public.work_orders w
        where w.assignee_id = target.assignee_id and w.status = 'queued'
        order by w.queue_position limit 1;
      end if;
      return jsonb_build_object('status', applied.to_status, 'event_id', applied.id, 'next_order_id', next_order, 'replayed', true);
    end if;
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
