create table public.safety_checklist_items (
  id uuid primary key default gen_random_uuid(),
  equipment_type public.equipment_type,
  fault_category public.fault_category,
  text text not null check (length(trim(text)) between 3 and 300),
  sort_order smallint not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.safety_checklist_items enable row level security;
create policy safety_checklist_items_read on public.safety_checklist_items for select to authenticated
  using ((select public.current_employee_id()) is not null);
create policy safety_checklist_items_admin_insert on public.safety_checklist_items for insert to authenticated
  with check ((select public.has_role('admin')));
create policy safety_checklist_items_admin_update on public.safety_checklist_items for update to authenticated
  using ((select public.has_role('admin'))) with check ((select public.has_role('admin')));
create policy safety_checklist_items_admin_delete on public.safety_checklist_items for delete to authenticated
  using ((select public.has_role('admin')));
select public.attach_standard_triggers('public.safety_checklist_items');

insert into public.safety_checklist_items (equipment_type, fault_category, text, sort_order) values
  (null, null, 'Оборудование остановлено, пусковой аппарат отключён', 10),
  (null, null, 'Вывешен плакат «Не включать! Работают люди»', 20),
  (null, null, 'Средства индивидуальной защиты надеты и исправны', 30),
  (null, null, 'Место работ осмотрено и ограждено', 40),
  (null, 'electrical', 'Проверено отсутствие напряжения указателем', 50),
  (null, 'electrical', 'Установлено переносное заземление', 60),
  (null, 'hydraulic', 'Давление в гидросистеме сброшено до нуля', 50),
  (null, 'pneumatic', 'Воздух стравлен, ресивер отсечён', 50),
  ('conveyor', null, 'Лента застопорена от самопроизвольного движения', 70),
  ('crusher', null, 'Камера дробления освобождена от материала', 70),
  ('mill', null, 'Барабан застопорен, загрузка остановлена', 70);

alter table public.lockouts add column checklist jsonb not null default '[]';

create or replace function public.order_fault_category(target public.work_orders)
returns public.fault_category
language sql
stable
security definer
set search_path = ''
as $$
  select f.category from public.fault_codes f where f.id = coalesce(target.fault_code_id, target.suggested_fault_code_id);
$$;

create or replace function public.required_permits(order_id uuid)
returns table (permit_type_id uuid, code text, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct pt.id, pt.code, pt.name
  from public.work_orders w
  join public.equipment e on e.id = w.equipment_id
  join public.equipment_permit_requirements r
    on (r.equipment_type is null or r.equipment_type = e.equipment_type)
   and (r.fault_category is null or r.fault_category = public.order_fault_category(w))
  join public.permit_types pt on pt.id = r.permit_type_id
  where w.id = order_id;
$$;

create or replace function public.missing_permits(target_employee_id uuid, order_id uuid)
returns table (permit_type_id uuid, code text, name text, expired_on date)
language sql
stable
security definer
set search_path = ''
as $$
  select rp.permit_type_id, rp.code, rp.name,
    (select max(ep.expires_on) from public.employee_permits ep
      where ep.employee_id = target_employee_id and ep.permit_type_id = rp.permit_type_id)
  from public.required_permits(order_id) rp
  where not exists (
    select 1 from public.employee_permits ep
    where ep.employee_id = target_employee_id
      and ep.permit_type_id = rp.permit_type_id
      and ep.expires_on >= (now() at time zone 'Asia/Qostanay')::date
  );
$$;

create or replace function public.check_start_gate(order_id uuid, actor_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  missing jsonb;
  needs_lockout boolean;
  has_lockout boolean;
begin
  select coalesce(jsonb_agg(jsonb_build_object('code', m.code, 'name', m.name, 'expired_on', m.expired_on)), '[]')
  into missing from public.missing_permits(actor_id, order_id) m;
  select e.requires_lockout into needs_lockout
  from public.work_orders w join public.equipment e on e.id = w.equipment_id where w.id = order_id;
  select exists (select 1 from public.lockouts l where l.work_order_id = order_id and l.released_at is null) into has_lockout;
  return jsonb_build_object(
    'ok', jsonb_array_length(missing) = 0 and (not coalesce(needs_lockout, false) or has_lockout),
    'missing_permits', missing,
    'lockout_required', coalesce(needs_lockout, false),
    'lockout_active', has_lockout
  );
end;
$$;

create or replace function public.start_gate(order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor record;
  target public.work_orders;
  checklist jsonb;
begin
  select * into actor from public.wo_actor();
  select * into target from public.work_orders w where w.id = order_id;
  if not found or actor.role is null then
    perform public.wo_raise('not_found');
  end if;
  perform public.wo_authorize(target, actor.role, actor.employee_id, actor.brigade_id);
  select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'text', i.text) order by i.sort_order, i.text), '[]')
  into checklist
  from public.safety_checklist_items i
  join public.equipment e on e.id = target.equipment_id
  where i.is_active
    and (i.equipment_type is null or i.equipment_type = e.equipment_type)
    and (i.fault_category is null or i.fault_category = public.order_fault_category(target));
  return public.check_start_gate(order_id, coalesce(target.assignee_id, actor.employee_id))
    || jsonb_build_object('checklist', checklist);
end;
$$;

create or replace function public.apply_lockout(order_id uuid, tag_photo_path text, ai_check jsonb, checklist jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor record;
  target public.work_orders;
  missing integer;
  created uuid;
begin
  select * into actor from public.wo_actor();
  select * into target from public.work_orders w where w.id = order_id for update;
  if not found then
    perform public.wo_raise('not_found');
  end if;
  if actor.role is distinct from 'worker' then
    perform public.wo_raise('forbidden');
  end if;
  perform public.wo_authorize(target, actor.role, actor.employee_id, actor.brigade_id);
  if target.status not in ('accepted', 'rework') then
    perform public.wo_raise('invalid_transition');
  end if;
  select count(*) into missing from public.missing_permits(actor.employee_id, order_id);
  if missing > 0 then
    perform public.wo_raise('permit_missing');
  end if;
  if tag_photo_path is null or tag_photo_path not like order_id::text || '/%' then
    perform public.wo_raise('lockout_photo_required');
  end if;
  select l.id into created from public.lockouts l where l.work_order_id = order_id and l.released_at is null;
  if created is null then
    insert into public.lockouts (equipment_id, work_order_id, locked_by, tag_photo_path, ai_check, checklist)
    values (target.equipment_id, order_id, actor.employee_id, tag_photo_path, ai_check, coalesce(checklist, '[]'))
    returning id into created;
    insert into public.work_order_events (work_order_id, actor_id, action, from_status, to_status, comment, payload)
    values (order_id, actor.employee_id, 'comment', target.status, target.status, 'LOTO', jsonb_build_object('lockout_id', created));
  end if;
  return jsonb_build_object('lockout_id', created);
end;
$$;

create or replace function public.release_lockout_on_finish()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('closed', 'cancelled') and old.status is distinct from new.status then
    update public.lockouts
    set released_at = now(),
        released_by = coalesce((select e.id from public.employees e where e.auth_user_id = auth.uid()), new.master_id)
    where work_order_id = new.id and released_at is null;
  end if;
  return null;
end;
$$;

create trigger work_orders_release_lockout
after update of status on public.work_orders
for each row execute function public.release_lockout_on_finish();

create or replace function public.release_lockout(order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor record;
  target public.work_orders;
begin
  select * into actor from public.wo_actor();
  select * into target from public.work_orders w where w.id = order_id;
  if not found then
    perform public.wo_raise('not_found');
  end if;
  perform public.wo_authorize(target, actor.role, actor.employee_id, actor.brigade_id);
  if target.status not in ('done', 'ai_review', 'closed', 'cancelled') then
    perform public.wo_raise('invalid_transition');
  end if;
  update public.lockouts set released_at = now(), released_by = actor.employee_id
  where work_order_id = order_id and released_at is null;
end;
$$;

drop function public.assignee_board(public.equipment_type);

create or replace function public.assignee_board(target_equipment_type public.equipment_type default null, target_fault_category public.fault_category default null)
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
  closed_on_type integer,
  missing_permits text[]
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
    e.id, e.full_name, e.specialty, e.grade, e.brigade_id, e.on_shift, active.id, active.number,
    (select count(*)::integer from public.work_orders q where q.assignee_id = e.id and q.status in ('queued', 'issued')),
    (select count(*)::integer from public.work_orders c join public.equipment eq on eq.id = c.equipment_id
      where c.assignee_id = e.id and c.status = 'closed'
        and (target_equipment_type is null or eq.equipment_type = target_equipment_type)),
    coalesce((
      select array_agg(distinct pt.name order by pt.name)
      from public.equipment_permit_requirements r
      join public.permit_types pt on pt.id = r.permit_type_id
      where target_equipment_type is not null
        and (r.equipment_type is null or r.equipment_type = target_equipment_type)
        and (r.fault_category is null or r.fault_category = target_fault_category)
        and (r.equipment_type is not null or target_fault_category is not null)
        and not exists (
          select 1 from public.employee_permits ep
          where ep.employee_id = e.id and ep.permit_type_id = r.permit_type_id
            and ep.expires_on >= (now() at time zone 'Asia/Qostanay')::date
        )
    ), '{}')
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

revoke execute on function public.order_fault_category(public.work_orders), public.missing_permits(uuid, uuid),
  public.release_lockout_on_finish() from public, anon, authenticated;
revoke execute on function public.required_permits(uuid), public.start_gate(uuid),
  public.apply_lockout(uuid, text, jsonb, jsonb), public.release_lockout(uuid),
  public.assignee_board(public.equipment_type, public.fault_category) from public, anon;
grant execute on function public.required_permits(uuid), public.start_gate(uuid),
  public.apply_lockout(uuid, text, jsonb, jsonb), public.release_lockout(uuid),
  public.assignee_board(public.equipment_type, public.fault_category) to authenticated;
