create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create type public.app_role as enum ('master', 'worker', 'manager', 'admin');
create type public.shift_crew as enum ('A', 'B', 'C', 'D');
create type public.shift_period as enum ('day', 'night');
create type public.specialty as enum ('fitter', 'electrician', 'welder', 'hydraulic', 'lubricator', 'instrumentation');
create type public.equipment_type as enum ('crusher', 'conveyor', 'pump', 'screen', 'mill', 'classifier', 'feeder', 'fan', 'compressor', 'other');
create type public.fault_category as enum ('mechanical', 'electrical', 'hydraulic', 'pneumatic', 'lubrication');
create type public.reason_kind as enum ('reject', 'pause');
create type public.work_order_type as enum ('planned', 'unplanned');
create type public.work_order_priority as enum ('emergency', 'high', 'normal', 'planned');
create type public.work_order_status as enum (
  'issued', 'queued', 'accepted', 'rejected', 'in_progress', 'paused', 'done', 'ai_review', 'closed', 'rework', 'cancelled'
);
create type public.work_order_action as enum (
  'issue', 'queue', 'accept', 'reject', 'start', 'pause', 'resume', 'complete', 'submit_review',
  'approve', 'return_rework', 'reassign', 'cancel', 'change_priority', 'comment'
);
create type public.photo_kind as enum ('before', 'after', 'loto');
create type public.acoustic_kind as enum ('before', 'after');
create type public.review_verdict as enum ('accepted', 'accepted_with_remarks', 'rework');
create type public.rca_status as enum ('open', 'in_progress', 'closed');
create type public.rating_subject as enum ('employee', 'brigade');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create table public.audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id text,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  actor_auth_id uuid,
  old_data jsonb,
  new_data jsonb,
  occurred_at timestamptz not null default now()
);

create index audit_log_table_record_idx on public.audit_log (table_name, record_id);
create index audit_log_occurred_at_idx on public.audit_log (occurred_at desc);

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
    coalesce(row_data ->> 'id', row_data ->> 'key'),
    tg_op,
    auth.uid(),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return null;
end;
$$;

create or replace function public.attach_standard_triggers(target regclass, with_updated_at boolean default true)
returns void
language plpgsql
set search_path = ''
as $$
declare
  table_name text := (select c.relname from pg_catalog.pg_class c where c.oid = target);
begin
  if with_updated_at then
    execute format(
      'create trigger %I before update on %s for each row execute function public.set_updated_at()',
      table_name || '_set_updated_at', target
    );
  end if;
  execute format(
    'create trigger %I after insert or update or delete on %s for each row execute function public.write_audit_log()',
    table_name || '_audit', target
  );
end;
$$;
