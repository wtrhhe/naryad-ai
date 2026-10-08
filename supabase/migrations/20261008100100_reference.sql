create table public.sites (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9_-]{2,16}$'),
  name text not null check (length(trim(name)) between 2 and 120),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.brigades (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) between 2 and 120),
  site_id uuid references public.sites (id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users (id) on delete set null,
  personnel_number text not null unique check (personnel_number ~ '^[0-9]{3,10}$'),
  full_name text not null check (length(trim(full_name)) between 3 and 160),
  role public.app_role not null,
  specialty public.specialty,
  grade smallint check (grade between 1 and 8),
  brigade_id uuid references public.brigades (id) on delete set null,
  crew public.shift_crew,
  on_shift boolean not null default false,
  locale text not null default 'ru' check (locale in ('ru', 'kk')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employees_worker_has_specialty check (role <> 'worker' or specialty is not null)
);

create index employees_brigade_idx on public.employees (brigade_id);
create index employees_role_shift_idx on public.employees (role, on_shift) where is_active;

create table public.employee_sites (
  employee_id uuid not null references public.employees (id) on delete cascade,
  site_id uuid not null references public.sites (id) on delete cascade,
  primary key (employee_id, site_id)
);

create index employee_sites_site_idx on public.employee_sites (site_id);

create table public.equipment (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete restrict,
  name text not null check (length(trim(name)) between 2 and 160),
  inventory_number text not null unique check (length(trim(inventory_number)) between 2 and 40),
  equipment_type public.equipment_type not null,
  criticality smallint not null default 2 check (criticality between 1 and 3),
  downtime_cost_per_hour numeric(14, 2) not null default 0 check (downtime_cost_per_hour >= 0),
  requires_lockout boolean not null default true,
  qr_token uuid not null unique default gen_random_uuid(),
  rpm numeric(8, 2) check (rpm > 0),
  bearing_rolling_elements smallint check (bearing_rolling_elements between 3 and 60),
  bearing_ball_diameter_mm numeric(8, 3) check (bearing_ball_diameter_mm > 0),
  bearing_pitch_diameter_mm numeric(8, 3) check (bearing_pitch_diameter_mm > 0),
  bearing_contact_angle_deg numeric(5, 2) check (bearing_contact_angle_deg between 0 and 60),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint equipment_bearing_geometry_complete check (
    (bearing_rolling_elements is null and bearing_ball_diameter_mm is null and bearing_pitch_diameter_mm is null)
    or (bearing_rolling_elements is not null and bearing_ball_diameter_mm is not null and bearing_pitch_diameter_mm is not null
        and bearing_ball_diameter_mm < bearing_pitch_diameter_mm)
  )
);

create index equipment_site_idx on public.equipment (site_id);
create index equipment_type_idx on public.equipment (equipment_type);

create table public.fault_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[МЭГПС]-[0-9]{2}$'),
  category public.fault_category not null,
  name text not null check (length(trim(name)) between 2 and 160),
  description text,
  standard_hours numeric(6, 2) not null check (standard_hours > 0),
  required_specialty public.specialty not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.materials (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (length(trim(code)) between 2 and 40),
  name text not null check (length(trim(name)) between 2 and 160),
  unit text not null check (length(trim(unit)) between 1 and 16),
  price numeric(14, 2) not null default 0 check (price >= 0),
  categories public.fault_category[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.material_norms (
  id uuid primary key default gen_random_uuid(),
  fault_code_id uuid not null references public.fault_codes (id) on delete cascade,
  material_id uuid not null references public.materials (id) on delete cascade,
  qty_min numeric(12, 3) not null check (qty_min >= 0),
  qty_typical numeric(12, 3) not null,
  qty_max numeric(12, 3) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fault_code_id, material_id),
  constraint material_norms_ordered check (qty_min <= qty_typical and qty_typical <= qty_max)
);

create index material_norms_material_idx on public.material_norms (material_id);

create table public.time_norms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 160),
  equipment_type public.equipment_type,
  fault_code_id uuid references public.fault_codes (id) on delete cascade,
  hours numeric(6, 2) not null check (hours > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index time_norms_fault_code_idx on public.time_norms (fault_code_id);

create table public.reason_codes (
  id uuid primary key default gen_random_uuid(),
  kind public.reason_kind not null,
  code text not null check (code ~ '^[a-z_]{2,40}$'),
  label text not null check (length(trim(label)) between 2 and 120),
  is_valid_excuse boolean not null default true,
  sort_order smallint not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kind, code)
);

create table public.permit_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9_]{2,40}$'),
  name text not null check (length(trim(name)) between 2 and 160),
  validity_months smallint check (validity_months between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.employee_permits (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  permit_type_id uuid not null references public.permit_types (id) on delete restrict,
  certificate_number text not null check (length(trim(certificate_number)) between 1 and 60),
  issued_on date not null,
  expires_on date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, permit_type_id, certificate_number),
  constraint employee_permits_dates check (issued_on <= expires_on)
);

create index employee_permits_employee_idx on public.employee_permits (employee_id, expires_on);

create table public.equipment_permit_requirements (
  id uuid primary key default gen_random_uuid(),
  permit_type_id uuid not null references public.permit_types (id) on delete cascade,
  equipment_type public.equipment_type,
  fault_category public.fault_category,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint equipment_permit_requirements_scope check (equipment_type is not null or fault_category is not null),
  unique nulls not distinct (permit_type_id, equipment_type, fault_category)
);

create table public.settings (
  key text primary key check (key ~ '^[a-z_.]{2,80}$'),
  value jsonb not null,
  updated_by uuid references public.employees (id) on delete set null,
  updated_at timestamptz not null default now()
);

select public.attach_standard_triggers('public.sites');
select public.attach_standard_triggers('public.brigades');
select public.attach_standard_triggers('public.employees');
select public.attach_standard_triggers('public.equipment');
select public.attach_standard_triggers('public.fault_codes');
select public.attach_standard_triggers('public.materials');
select public.attach_standard_triggers('public.material_norms');
select public.attach_standard_triggers('public.time_norms');
select public.attach_standard_triggers('public.reason_codes');
select public.attach_standard_triggers('public.permit_types');
select public.attach_standard_triggers('public.employee_permits');
select public.attach_standard_triggers('public.equipment_permit_requirements');
select public.attach_standard_triggers('public.settings');
select public.attach_standard_triggers('public.employee_sites', false);

insert into public.settings (key, value) values
  ('deadline.reminder_minutes', '30'),
  ('deadline.accept_timeout_minutes', '10'),
  ('deadline.accept_timeout_emergency_minutes', '3'),
  ('deadline.repeat_interval_minutes', '15'),
  ('deadline.manager_escalation_minutes', '120'),
  ('demo.time_scale', '1'),
  ('review.material_overuse_percent', '25'),
  ('review.low_confidence_threshold', '0.6'),
  ('ghost.min_alignment', '0.7'),
  ('rating.weights', '{"quality": 0.40, "on_time": 0.25, "no_rework": 0.20, "volume": 0.15, "max_refusal_penalty": 10}');
