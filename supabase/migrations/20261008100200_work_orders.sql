create sequence public.work_order_number_seq start with 1;

create table public.work_orders (
  id uuid primary key default gen_random_uuid(),
  number bigint not null unique default nextval('public.work_order_number_seq'),
  kind public.work_order_type not null,
  priority public.work_order_priority not null,
  status public.work_order_status not null default 'issued',
  description text not null check (length(trim(description)) between 3 and 4000),
  comment text check (length(comment) <= 4000),
  site_id uuid not null references public.sites (id) on delete restrict,
  equipment_id uuid not null references public.equipment (id) on delete restrict,
  assignee_id uuid references public.employees (id) on delete set null,
  brigade_id uuid references public.brigades (id) on delete set null,
  master_id uuid not null references public.employees (id) on delete restrict,
  due_at timestamptz,
  standard_hours numeric(6, 2) check (standard_hours > 0),
  queue_position integer check (queue_position > 0),
  suggested_fault_code_id uuid references public.fault_codes (id) on delete set null,
  suggested_standard_hours numeric(6, 2) check (suggested_standard_hours > 0),
  suggestion jsonb,
  fault_code_id uuid references public.fault_codes (id) on delete set null,
  work_performed text check (length(work_performed) <= 8000),
  close_comment text check (length(close_comment) <= 4000),
  last_comment text check (length(last_comment) <= 4000),
  shift_crew public.shift_crew,
  shift_period public.shift_period not null,
  rework_count integer not null default 0 check (rework_count >= 0),
  paused_seconds integer not null default 0 check (paused_seconds >= 0),
  issued_at timestamptz not null default now(),
  queued_at timestamptz,
  accepted_at timestamptz,
  rejected_at timestamptz,
  started_at timestamptz,
  paused_at timestamptz,
  done_at timestamptz,
  review_started_at timestamptz,
  closed_at timestamptz,
  cancelled_at timestamptz,
  downtime_started_at timestamptz,
  downtime_ended_at timestamptz,
  downtime_cost numeric(14, 2) check (downtime_cost >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_orders_has_executor check (assignee_id is not null or brigade_id is not null),
  constraint work_orders_has_deadline check (due_at is not null or standard_hours is not null),
  constraint work_orders_downtime_order check (downtime_ended_at is null or downtime_started_at <= downtime_ended_at)
);

create index work_orders_status_idx on public.work_orders (status);
create index work_orders_assignee_status_idx on public.work_orders (assignee_id, status);
create index work_orders_brigade_idx on public.work_orders (brigade_id);
create index work_orders_master_idx on public.work_orders (master_id);
create index work_orders_site_issued_idx on public.work_orders (site_id, issued_at desc);
create index work_orders_equipment_issued_idx on public.work_orders (equipment_id, issued_at desc);
create index work_orders_fault_code_idx on public.work_orders (fault_code_id);
create index work_orders_due_open_idx on public.work_orders (due_at)
  where status not in ('closed', 'cancelled', 'rejected');

create table public.work_order_events (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders (id) on delete cascade,
  actor_id uuid references public.employees (id) on delete set null,
  action public.work_order_action not null,
  from_status public.work_order_status,
  to_status public.work_order_status,
  reason_code_id uuid references public.reason_codes (id) on delete set null,
  reason_text text check (length(reason_text) <= 1000),
  comment text check (length(comment) <= 4000),
  payload jsonb not null default '{}',
  device_at timestamptz,
  occurred_at timestamptz not null default now()
);

create index work_order_events_order_idx on public.work_order_events (work_order_id, occurred_at);
create index work_order_events_actor_idx on public.work_order_events (actor_id, occurred_at desc);

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders (id) on delete cascade,
  kind public.photo_kind not null,
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/webp', 'image/jpeg', 'image/png')),
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  width integer check (width > 0),
  height integer check (height > 0),
  taken_at timestamptz,
  received_at timestamptz not null default now(),
  author_id uuid references public.employees (id) on delete set null,
  phash text check (phash ~ '^[0-9a-f]{16}$'),
  ghost_score numeric(4, 3) check (ghost_score between 0 and 1),
  forced_reason text check (length(forced_reason) <= 500),
  created_at timestamptz not null default now()
);

create index photos_order_kind_idx on public.photos (work_order_id, kind);
create index photos_phash_idx on public.photos (phash) where phash is not null;

create table public.acoustic_samples (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid references public.work_orders (id) on delete cascade,
  equipment_id uuid not null references public.equipment (id) on delete cascade,
  kind public.acoustic_kind not null,
  storage_path text unique,
  spectrum jsonb not null,
  rms numeric(12, 6) not null check (rms >= 0),
  peaks jsonb not null default '[]',
  spectral_kurtosis numeric(12, 4),
  sample_rate integer not null check (sample_rate between 8000 and 192000),
  duration_seconds numeric(6, 2) not null check (duration_seconds > 0),
  recorded_by uuid references public.employees (id) on delete set null,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index acoustic_samples_equipment_idx on public.acoustic_samples (equipment_id, recorded_at desc);
create index acoustic_samples_order_idx on public.acoustic_samples (work_order_id);

create table public.material_writeoffs (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders (id) on delete cascade,
  material_id uuid not null references public.materials (id) on delete restrict,
  quantity numeric(12, 3) not null check (quantity > 0),
  created_at timestamptz not null default now(),
  unique (work_order_id, material_id)
);

create index material_writeoffs_material_idx on public.material_writeoffs (material_id);

create table public.ai_reviews (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders (id) on delete cascade,
  revision integer not null default 0 check (revision >= 0),
  verdict public.review_verdict,
  score smallint check (score between 0 and 100),
  rating smallint check (rating between 1 and 5),
  checks jsonb not null default '[]',
  strengths text[] not null default '{}',
  improvements text[] not null default '{}',
  worker_explanation text,
  master_explanation text,
  confidence numeric(4, 3) check (confidence between 0 and 1),
  needs_master_review boolean not null default false,
  used_llm boolean not null default false,
  model text,
  master_id uuid references public.employees (id) on delete set null,
  master_verdict public.review_verdict,
  master_score smallint check (master_score between 0 and 100),
  master_rating smallint check (master_rating between 1 and 5),
  master_comment text check (length(master_comment) <= 2000),
  master_decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (work_order_id, revision),
  constraint ai_reviews_override_commented check (
    master_score is null or master_score = score or length(trim(coalesce(master_comment, ''))) > 0
  )
);

create table public.lockouts (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipment (id) on delete cascade,
  work_order_id uuid not null references public.work_orders (id) on delete cascade,
  locked_by uuid not null references public.employees (id) on delete restrict,
  tag_photo_path text,
  ai_check jsonb,
  locked_at timestamptz not null default now(),
  released_at timestamptz,
  released_by uuid references public.employees (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint lockouts_release_order check (released_at is null or released_at >= locked_at)
);

create unique index lockouts_active_per_order_idx on public.lockouts (work_order_id) where released_at is null;
create index lockouts_active_equipment_idx on public.lockouts (equipment_id) where released_at is null;

select public.attach_standard_triggers('public.work_orders');
select public.attach_standard_triggers('public.ai_reviews');
select public.attach_standard_triggers('public.material_writeoffs', false);
select public.attach_standard_triggers('public.lockouts', false);
