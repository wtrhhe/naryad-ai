create or replace function public.notify_order_assignee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient public.employees;
  equipment_name text;
  site_name text;
  is_kazakh boolean;
  headline text;
begin
  if new.assignee_id is null or (tg_op = 'UPDATE' and old.assignee_id is not distinct from new.assignee_id) then
    return null;
  end if;
  select * into recipient from public.employees where id = new.assignee_id;
  select e.name, s.name into equipment_name, site_name
  from public.equipment e join public.sites s on s.id = e.site_id where e.id = new.equipment_id;
  is_kazakh := recipient.locale = 'kk';
  headline := case
    when new.priority = 'emergency' and is_kazakh then format('Апаттық наряд №%s', new.number)
    when new.priority = 'emergency' then format('Аварийный наряд №%s', new.number)
    when is_kazakh then format('Жаңа наряд №%s', new.number)
    else format('Новый наряд №%s', new.number)
  end;
  insert into public.notifications (recipient_id, kind, title, body, work_order_id, payload, is_urgent, dedupe_key)
  values (
    new.assignee_id,
    'order_issued',
    headline,
    format(case when is_kazakh then '%s, учаске: %s. %s' else '%s, участок: %s. %s' end,
      equipment_name, site_name, left(new.description, 160)),
    new.id,
    jsonb_build_object('url', '/worker/orders/' || new.id, 'order_number', new.number),
    new.priority = 'emergency',
    format('order_issued:%s:%s:%s', new.id, new.assignee_id, extract(epoch from now())::bigint)
  )
  on conflict (dedupe_key) do nothing;
  return null;
end;
$$;

create trigger work_orders_notify_assignee
after insert or update of assignee_id on public.work_orders
for each row execute function public.notify_order_assignee();

create or replace function private.dispatch_push_soon()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.invoke_cron_target('push');
  return null;
end;
$$;

create trigger notifications_dispatch_push
after insert on public.notifications
for each statement execute function private.dispatch_push_soon();

revoke execute on function public.notify_order_assignee() from public, anon, authenticated;
revoke execute on function private.dispatch_push_soon() from public, anon, authenticated;

select cron.schedule('push-dispatcher', '* * * * *', $$select private.invoke_cron_target('push')$$);
