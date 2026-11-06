alter table public.properties
  add column if not exists description text,
  add column if not exists features jsonb not null default '[]'::jsonb;

alter table public.properties
  add constraint properties_features_array
  check (jsonb_typeof(features) = 'array');

alter table public.leads
  add column if not exists consent_to_updates boolean not null default false,
  add column if not exists priority_score integer not null default 0
    check (priority_score between 0 and 100),
  add column if not exists assigned_staff_id uuid;

alter table public.notifications
  add column if not exists recipient_user_id uuid references auth.users(id) on delete cascade;

alter table public.notifications
  drop constraint if exists notifications_event_type_check;
alter table public.notifications
  add constraint notifications_event_type_check
  check (event_type in (
    'lead.created', 'lead.updated', 'viewing.requested', 'callback.requested',
    'lead.assigned', 'lead.priority', 'task.assigned', 'task.overdue',
    'property.match', 'property.status_changed', 'automation.failed'
  ));

create table if not exists public.staff_roles (
  role_id uuid primary key default gen_random_uuid(),
  role_code varchar(40) not null unique,
  display_name varchar(100) not null,
  permissions jsonb not null default '[]'::jsonb
    check (jsonb_typeof(permissions) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.staff_roles (role_code, display_name, permissions) values
  ('administrator', 'Administrator', '["*"]'::jsonb),
  ('agent', 'Real Estate Agent', '["leads:assigned:read","leads:assigned:update","properties:read","tasks:assigned:read","tasks:assigned:update","assistant:staff"]'::jsonb),
  ('sales_leasing', 'Sales & Leasing', '["leads:assigned:read","leads:assigned:update","properties:read","transactions:assigned:read","leases:assigned:read","tasks:assigned:read","tasks:assigned:update","assistant:staff"]'::jsonb),
  ('property_manager', 'Property Manager', '["properties:assigned:read","properties:assigned:update","leases:assigned:read","tasks:assigned:read","tasks:assigned:update","assistant:staff"]'::jsonb),
  ('lead_coordinator', 'Lead Coordinator', '["leads:read","leads:create","leads:assign","leads:assigned:update","properties:read","tasks:read","tasks:create","tasks:assigned:update","assistant:staff"]'::jsonb)
on conflict (role_code) do update set
  display_name = excluded.display_name,
  permissions = excluded.permissions;

create table if not exists public.staff_profiles (
  staff_id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  role_id uuid not null references public.staff_roles(role_id) on delete restrict,
  display_name varchar(160) not null,
  email varchar(255) not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lead_assignment_history (
  assignment_id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(lead_id) on delete cascade,
  staff_id uuid references public.staff_profiles(staff_id) on delete set null,
  assigned_by uuid references public.staff_profiles(staff_id) on delete set null,
  assignment_reason varchar(80) not null default 'manual',
  created_at timestamptz not null default now()
);

create table if not exists public.property_staff_assignments (
  assignment_id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(property_id) on delete cascade,
  staff_id uuid not null references public.staff_profiles(staff_id) on delete cascade,
  assigned_by uuid references public.staff_profiles(staff_id) on delete set null,
  created_at timestamptz not null default now(),
  unique (property_id, staff_id)
);

alter table public.leads
  drop constraint if exists leads_assigned_staff_id_fkey;
alter table public.leads
  add constraint leads_assigned_staff_id_fkey
  foreign key (assigned_staff_id) references public.staff_profiles(staff_id) on delete set null;

create table if not exists public.tasks (
  task_id uuid primary key default gen_random_uuid(),
  title varchar(180) not null check (length(trim(title)) > 0),
  description text,
  task_type varchar(40) not null default 'follow_up',
  status varchar(30) not null default 'open'
    check (status in ('open', 'in_progress', 'completed', 'cancelled')),
  priority varchar(20) not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  assigned_to uuid references public.staff_profiles(staff_id) on delete set null,
  lead_id uuid references public.leads(lead_id) on delete cascade,
  property_id uuid references public.properties(property_id) on delete cascade,
  due_at timestamptz,
  created_by uuid references public.staff_profiles(staff_id) on delete set null,
  automation_key text unique,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.property_match_requests (
  request_id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(lead_id) on delete cascade,
  preferred_location text,
  budget_min numeric(14, 2) check (budget_min is null or budget_min >= 0),
  budget_max numeric(14, 2) check (budget_max is null or budget_max >= 0),
  property_type varchar(50),
  bedrooms_required integer check (bedrooms_required is null or bedrooms_required >= 0),
  additional_requirements jsonb not null default '{}'::jsonb
    check (jsonb_typeof(additional_requirements) = 'object'),
  criteria_fingerprint text not null,
  match_status varchar(20) not null default 'waiting'
    check (match_status in ('waiting', 'matched', 'notified', 'fulfilled', 'cancelled')),
  last_matched_at timestamptz,
  last_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (budget_min is null or budget_max is null or budget_min <= budget_max),
  unique (request_id, lead_id),
  unique (lead_id, criteria_fingerprint)
);

create index if not exists idx_property_match_waiting
  on public.property_match_requests(match_status, created_at)
  where match_status in ('waiting', 'matched');
create index if not exists idx_property_match_lead on public.property_match_requests(lead_id);

create table if not exists public.property_matches (
  match_id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.property_match_requests(request_id) on delete cascade,
  property_id uuid not null references public.properties(property_id) on delete cascade,
  relevance_score integer not null check (relevance_score between 0 and 100),
  match_reasons jsonb not null default '[]'::jsonb
    check (jsonb_typeof(match_reasons) = 'array'),
  match_status varchar(20) not null default 'matched'
    check (match_status in ('matched', 'viewed', 'dismissed', 'enquired', 'unavailable')),
  created_at timestamptz not null default now(),
  unique (request_id, property_id)
);

create table if not exists public.property_match_deliveries (
  delivery_id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.property_matches(match_id) on delete cascade,
  lead_id uuid not null references public.leads(lead_id) on delete cascade,
  channel varchar(20) not null check (channel in ('email', 'sms')),
  recipient text not null,
  status varchar(20) not null default 'queued'
    check (status in ('queued', 'sent', 'failed', 'cancelled')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (match_id, channel)
);

create table if not exists public.audit_logs (
  audit_id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_staff_id uuid references public.staff_profiles(staff_id) on delete set null,
  action varchar(80) not null,
  entity_type varchar(60) not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  request_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_created_at on public.audit_logs(created_at desc);
create index if not exists idx_audit_logs_entity on public.audit_logs(entity_type, entity_id, created_at desc);

create table if not exists public.automation_jobs (
  job_id uuid primary key default gen_random_uuid(),
  event_type varchar(60) not null,
  entity_type varchar(40) not null,
  entity_id uuid not null,
  payload jsonb not null default '{}'::jsonb,
  status varchar(20) not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 10),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  dedupe_key text not null unique,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.assistant_match_request_keys (
  idempotency_key uuid primary key,
  lead_id uuid not null references public.leads(lead_id) on delete cascade,
  request_id uuid not null references public.property_match_requests(request_id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.staff_action_confirmations (
  confirmation_id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  action_type varchar(60) not null,
  entity_type varchar(40) not null,
  entity_id uuid not null,
  proposed_changes jsonb not null check (jsonb_typeof(proposed_changes) = 'object'),
  status varchar(20) not null default 'pending'
    check (status in ('pending', 'confirmed', 'cancelled', 'expired')),
  expires_at timestamptz not null default now() + interval '15 minutes',
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

create table if not exists public.staff_assistant_conversations (
  session_id uuid primary key,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  messages jsonb not null default '[]'::jsonb check (jsonb_typeof(messages) = 'array'),
  expires_at timestamptz not null default now() + interval '14 days',
  updated_at timestamptz not null default now()
);

create index if not exists idx_automation_jobs_ready
  on public.automation_jobs(status, available_at, created_at)
  where status in ('pending', 'failed');
create index if not exists idx_tasks_assignee_due
  on public.tasks(assigned_to, status, due_at);
create index if not exists idx_tasks_lead on public.tasks(lead_id);
create index if not exists idx_staff_profiles_role on public.staff_profiles(role_id, is_active);
create index if not exists idx_leads_assigned_staff on public.leads(assigned_staff_id, lead_status);
create index if not exists idx_property_assignments_staff on public.property_staff_assignments(staff_id);
create index if not exists idx_notifications_recipient on public.notifications(recipient_user_id, created_at desc);
create index if not exists idx_staff_action_confirmation_actor
  on public.staff_action_confirmations(actor_user_id, status, expires_at);
create index if not exists idx_staff_assistant_expiry
  on public.staff_assistant_conversations(auth_user_id, expires_at);

create or replace function public.set_agency_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'staff_roles', 'staff_profiles', 'tasks', 'property_match_requests', 'properties'
  ] loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_set_updated_at', table_name);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_agency_updated_at()',
      table_name || '_set_updated_at',
      table_name
    );
  end loop;
end;
$$;

create or replace function public.enqueue_property_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  event text;
  event_key text;
begin
  if tg_op = 'INSERT' then
    event := 'property.created';
  elsif old.listing_status is distinct from new.listing_status then
    event := 'property.status_changed';
  else
    event := 'property.updated';
  end if;

  event_key := 'property:' || new.property_id::text || ':' || event || ':' ||
    extract(epoch from new.updated_at)::text;
  insert into public.automation_jobs (event_type, entity_type, entity_id, payload, dedupe_key)
  values (event, 'property', new.property_id, jsonb_build_object('listing_status', new.listing_status), event_key)
  on conflict (dedupe_key) do nothing;

  return new;
end;
$$;

drop trigger if exists properties_enqueue_change on public.properties;
create trigger properties_enqueue_change
after insert or update on public.properties
for each row execute function public.enqueue_property_change();

create or replace function public.match_property_to_waitlist(p_property_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  listing public.properties%rowtype;
  request_row public.property_match_requests%rowtype;
  reasons jsonb;
  score integer;
  inserted_count integer := 0;
  new_match_id uuid;
  lead_row public.leads%rowtype;
begin
  select * into listing from public.properties where property_id = p_property_id;
  if not found or listing.listing_status <> 'active' then
    if found then
      update public.property_matches
      set match_status = 'unavailable'
      where property_id = p_property_id and match_status = 'matched';
      update public.property_match_requests r
      set match_status = case
        when exists (
          select 1 from public.property_matches other_match
          join public.properties other_property on other_property.property_id = other_match.property_id
          where other_match.request_id = r.request_id
            and other_match.match_status = 'matched'
            and other_property.listing_status = 'active'
        ) then 'matched'
        else 'waiting'
      end
      where r.request_id in (
        select m.request_id from public.property_matches m where m.property_id = p_property_id
      )
      and r.match_status in ('matched', 'notified');
      update public.property_match_deliveries d
      set status = 'cancelled'
      where d.match_id in (
        select m.match_id from public.property_matches m where m.property_id = p_property_id
      )
      and d.status = 'queued';

      insert into public.notifications (event_type, lead_id, property_id, title, message, dedupe_key)
      select
        'property.status_changed',
        r.lead_id,
        p_property_id,
        'Property status changed',
        'A property in a client match list is no longer available.',
        'property-status:' || p_property_id::text || ':' || r.request_id::text || ':' || listing.updated_at::text
      from public.property_matches m
      join public.property_match_requests r on r.request_id = m.request_id
      where m.property_id = p_property_id
      on conflict (dedupe_key) do nothing;
    end if;
    return 0;
  end if;

  for request_row in
    select r.*
    from public.property_match_requests r
    join public.leads l on l.lead_id = r.lead_id
    where r.match_status in ('waiting', 'matched', 'notified')
      and l.lead_status not in ('closed', 'converted')
      and (r.preferred_location is null or listing.location ilike '%' || r.preferred_location || '%')
      and (r.budget_min is null or listing.listing_price >= r.budget_min)
      and (r.budget_max is null or listing.listing_price <= r.budget_max)
      and (r.property_type is null or listing.property_type ilike r.property_type)
      and (r.bedrooms_required is null or listing.bedrooms >= r.bedrooms_required)
  loop
    reasons := jsonb_build_array('active_listing');
    score := 50;
    if request_row.preferred_location is not null then
      score := score + 20;
      reasons := reasons || jsonb_build_array('location_match');
    end if;
    if request_row.budget_min is not null or request_row.budget_max is not null then
      score := score + 15;
      reasons := reasons || jsonb_build_array('within_budget');
    end if;
    if request_row.property_type is not null then
      score := score + 10;
      reasons := reasons || jsonb_build_array('property_type_match');
    end if;
    if request_row.bedrooms_required is not null then
      score := score + 5;
      reasons := reasons || jsonb_build_array('bedroom_requirement_met');
    end if;

    insert into public.property_matches (request_id, property_id, relevance_score, match_reasons)
    values (request_row.request_id, listing.property_id, least(score, 100), reasons)
    on conflict (request_id, property_id) do update
      set relevance_score = excluded.relevance_score,
          match_reasons = excluded.match_reasons,
          match_status = 'matched'
    returning match_id into new_match_id;

    update public.property_match_requests
    set match_status = 'matched', last_matched_at = now()
    where request_id = request_row.request_id;

    insert into public.notifications (event_type, lead_id, property_id, title, message, dedupe_key)
    values (
      'property.match',
      request_row.lead_id,
      listing.property_id,
      'Property match found',
      'An active listing matches a client waitlist request.',
      'match:' || request_row.request_id::text || ':' || listing.property_id::text
    ) on conflict (dedupe_key) do nothing;

    select * into lead_row from public.leads where lead_id = request_row.lead_id;
    if lead_row.consent_to_updates then
      if lead_row.email is not null then
        insert into public.property_match_deliveries (match_id, lead_id, channel, recipient)
        values (new_match_id, lead_row.lead_id, 'email', lead_row.email)
        on conflict (match_id, channel) do nothing;
      elsif lead_row.phone_number is not null then
        insert into public.property_match_deliveries (match_id, lead_id, channel, recipient)
        values (new_match_id, lead_row.lead_id, 'sms', lead_row.phone_number)
        on conflict (match_id, channel) do nothing;
      end if;
    end if;
    inserted_count := inserted_count + 1;
  end loop;

  return inserted_count;
end;
$$;

create or replace function public.match_waitlist_after_property_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT'
    or old.listing_status is distinct from new.listing_status
    or old.listing_price is distinct from new.listing_price
    or old.location is distinct from new.location
    or old.property_type is distinct from new.property_type
    or old.bedrooms is distinct from new.bedrooms then
    perform public.match_property_to_waitlist(new.property_id);
  end if;
  return new;
end;
$$;

drop trigger if exists properties_match_waitlist on public.properties;
create trigger properties_match_waitlist
after insert or update on public.properties
for each row execute function public.match_waitlist_after_property_change();

create or replace function public.assign_new_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_staff uuid;
begin
  if new.requested_action in ('viewing', 'callback') then
    new.priority_score := greatest(new.priority_score, 90);
  elsif new.consent_to_contact then
    new.priority_score := greatest(new.priority_score, 55);
  end if;

  if new.assigned_staff_id is null then
    select sp.staff_id into selected_staff
    from public.staff_profiles sp
    join public.staff_roles sr on sr.role_id = sp.role_id
    where sp.is_active
      and sr.role_code in ('agent', 'sales_leasing', 'lead_coordinator')
    order by (
      select count(*) from public.leads assigned
      where assigned.assigned_staff_id = sp.staff_id
        and assigned.lead_status not in ('closed', 'converted')
    ), sp.created_at
    limit 1;
    new.assigned_staff_id := selected_staff;
  end if;

  return new;
end;
$$;

drop trigger if exists leads_assign_new on public.leads;
create trigger leads_assign_new
before insert on public.leads
for each row execute function public.assign_new_lead();

create or replace function public.track_lead_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient uuid;
begin
  if tg_op = 'INSERT' and new.assigned_staff_id is not null then
    insert into public.lead_assignment_history (lead_id, staff_id, assignment_reason)
    values (new.lead_id, new.assigned_staff_id, 'auto');
    select auth_user_id into recipient from public.staff_profiles
    where staff_id = new.assigned_staff_id;
    if recipient is not null then
      insert into public.notifications (
        event_type, lead_id, title, message, recipient_user_id, dedupe_key
      ) values (
        'lead.assigned', new.lead_id, 'Lead assigned',
        'A new enquiry was assigned to you.', recipient,
        'lead:' || new.lead_id::text || ':assigned:' || new.assigned_staff_id::text
      ) on conflict (dedupe_key) do nothing;
    end if;
  elsif tg_op = 'UPDATE' and old.assigned_staff_id is distinct from new.assigned_staff_id then
    insert into public.lead_assignment_history (lead_id, staff_id, assignment_reason)
    values (new.lead_id, new.assigned_staff_id, 'manual');
    select auth_user_id into recipient from public.staff_profiles
    where staff_id = new.assigned_staff_id;
    if recipient is not null then
      insert into public.notifications (
        event_type, lead_id, title, message, recipient_user_id, dedupe_key
      ) values (
        'lead.assigned', new.lead_id, 'Lead assigned',
        'An enquiry was assigned to you.', recipient,
        'lead:' || new.lead_id::text || ':assigned:' || new.assigned_staff_id::text || ':' || new.updated_at::text
      ) on conflict (dedupe_key) do nothing;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists leads_track_assignment on public.leads;
create trigger leads_track_assignment
after insert or update of assigned_staff_id on public.leads
for each row execute function public.track_lead_assignment();

create or replace function public.notify_task_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient uuid;
begin
  if new.assigned_to is not null
     and (tg_op = 'INSERT' or old.assigned_to is distinct from new.assigned_to) then
    select auth_user_id into recipient from public.staff_profiles
    where staff_id = new.assigned_to;
    if recipient is not null then
      insert into public.notifications (
        event_type, lead_id, property_id, title, message,
        recipient_user_id, dedupe_key
      ) values (
        'task.assigned', new.lead_id, new.property_id, 'Task assigned',
        new.title, recipient,
        'task:' || new.task_id::text || ':assigned:' || recipient::text
      ) on conflict (dedupe_key) do nothing;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_notify_assignment on public.tasks;
create trigger tasks_notify_assignment
after insert or update of assigned_to on public.tasks
for each row execute function public.notify_task_assignment();

create or replace function public.run_overdue_lead_automation(p_response_hours integer default 24)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer;
begin
  if p_response_hours < 1 or p_response_hours > 720 then
    raise exception 'response hours must be between 1 and 720' using errcode = '22023';
  end if;

  insert into public.tasks (
    title, description, task_type, status, priority, assigned_to,
    lead_id, due_at, automation_key
  )
  select
    'Follow up with new lead',
    'No completed follow-up is recorded within the configured response target.',
    'lead_follow_up',
    'open',
    case when l.priority_score >= 80 then 'urgent' else 'high' end,
    l.assigned_staff_id,
    l.lead_id,
    now(),
    'overdue-lead:' || l.lead_id::text || ':' || date_trunc('day', now())::date::text
  from public.leads l
  where l.lead_status not in ('closed', 'converted')
    and l.created_at < now() - make_interval(hours => p_response_hours)
    and not exists (
      select 1 from public.tasks t
      where t.lead_id = l.lead_id
        and t.task_type = 'lead_follow_up'
        and t.status = 'completed'
        and t.created_at >= l.created_at
    )
  on conflict (automation_key) do nothing;
  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

create or replace function public.process_automation_jobs(p_batch_size integer default 20)
returns table (processed integer, failed integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  job public.automation_jobs%rowtype;
  processed_count integer := 0;
  failed_count integer := 0;
begin
  if p_batch_size < 1 or p_batch_size > 100 then
    raise exception 'batch size must be between 1 and 100' using errcode = '22023';
  end if;

  for job in
    select * from public.automation_jobs
    where status in ('pending', 'failed')
      and available_at <= now()
      and attempts < max_attempts
    order by created_at
    limit p_batch_size
    for update skip locked
  loop
    update public.automation_jobs
    set status = 'processing', attempts = attempts + 1, locked_at = now()
    where job_id = job.job_id;
    begin
      if job.entity_type = 'property' then
        perform public.match_property_to_waitlist(job.entity_id);
      end if;
      update public.automation_jobs
      set status = 'completed', completed_at = now(), locked_at = null, last_error = null
      where job_id = job.job_id;
      processed_count := processed_count + 1;
    exception when others then
      update public.automation_jobs
      set status = case when attempts + 1 >= max_attempts then 'failed' else 'pending' end,
          available_at = now() + make_interval(secs => least(3600, 30 * (2 ^ least(attempts, 7))::integer)),
          locked_at = null,
          last_error = left(sqlerrm, 500)
      where job_id = job.job_id;
      failed_count := failed_count + 1;
    end;
  end loop;
  return query select processed_count, failed_count;
end;
$$;

create or replace function public.get_agency_operation_summary(p_days integer default 7)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  since_at timestamptz;
  summary jsonb;
begin
  if p_days < 1 or p_days > 365 then
    raise exception 'days must be between 1 and 365' using errcode = '22023';
  end if;
  since_at := now() - make_interval(days => p_days);

  select jsonb_build_object(
    'period_days', p_days,
    'generated_at', now(),
    'properties', jsonb_build_object(
      'active', (select count(*) from public.properties where listing_status = 'active'),
      'pending', (select count(*) from public.properties where listing_status = 'pending'),
      'sold', (select count(*) from public.properties where listing_status = 'sold'),
      'rented', (select count(*) from public.properties where listing_status = 'rented')
    ),
    'leads', jsonb_build_object(
      'new_in_period', (select count(*) from public.leads where created_at >= since_at),
      'qualified', (select count(*) from public.leads where lead_status = 'qualified'),
      'converted_in_period', (select count(*) from public.leads where lead_status = 'converted' and updated_at >= since_at),
      'high_priority', (select count(*) from public.leads where priority_score >= 80 and lead_status not in ('converted', 'closed')),
      'unassigned', (select count(*) from public.leads where assigned_staff_id is null and lead_status not in ('converted', 'closed'))
    ),
    'transactions', jsonb_build_object(
      'created_in_period', (select count(*) from public.transactions where created_at >= since_at),
      'completed_in_period', (select count(*) from public.transactions where transaction_status = 'completed' and coalesce(transaction_date::timestamptz, created_at) >= since_at)
    ),
    'tasks', jsonb_build_object(
      'open', (select count(*) from public.tasks where status in ('open', 'in_progress')),
      'overdue', (select count(*) from public.tasks where status in ('open', 'in_progress') and due_at < now()),
      'due_in_period', (select count(*) from public.tasks where status in ('open', 'in_progress') and due_at >= now() and due_at < since_at + make_interval(days => p_days))
    ),
    'waitlist', jsonb_build_object(
      'waiting', (select count(*) from public.property_match_requests where match_status = 'waiting'),
      'popular_locations', coalesce((
        select jsonb_agg(jsonb_build_object('location', location, 'requests', request_count))
        from (
          select preferred_location as location, count(*) as request_count
          from public.property_match_requests
          where match_status in ('waiting', 'matched') and preferred_location is not null
          group by preferred_location order by request_count desc limit 5
        ) locations
      ), '[]'::jsonb),
      'popular_types', coalesce((
        select jsonb_agg(jsonb_build_object('property_type', property_type, 'requests', request_count))
        from (
          select property_type, count(*) as request_count
          from public.property_match_requests
          where match_status in ('waiting', 'matched') and property_type is not null
          group by property_type order by request_count desc limit 5
        ) types
      ), '[]'::jsonb),
      'common_budget_ranges', coalesce((
        select jsonb_agg(jsonb_build_object('budget_min', budget_min, 'budget_max', budget_max, 'requests', request_count))
        from (
          select budget_min, budget_max, count(*) as request_count
          from public.property_match_requests
          where match_status in ('waiting', 'matched')
          group by budget_min, budget_max order by request_count desc limit 5
        ) budgets
      ), '[]'::jsonb)
    )
  ) into summary;
  return summary;
end;
$$;

create or replace function public.log_agency_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  before_row jsonb;
  after_row jsonb;
  row_id uuid;
  action_name text;
begin
  if tg_op <> 'INSERT' then before_row := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then after_row := to_jsonb(new); end if;
  if tg_table_name = 'leads' then
    before_row := before_row - array['email', 'phone_number', 'notes'];
    after_row := after_row - array['email', 'phone_number', 'notes'];
  end if;
  row_id := coalesce((after_row->>(tg_table_name || '_id'))::uuid, (before_row->>(tg_table_name || '_id'))::uuid);
  if row_id is null then
    row_id := coalesce((after_row->>'lead_id')::uuid, (before_row->>'lead_id')::uuid,
                       (after_row->>'task_id')::uuid, (before_row->>'task_id')::uuid,
                       (after_row->>'staff_id')::uuid, (before_row->>'staff_id')::uuid);
  end if;
  action_name := lower(tg_op) || '.' || tg_table_name;

  insert into public.audit_logs (
    actor_user_id, actor_staff_id, action, entity_type, entity_id, before_data, after_data
  ) values (
    auth.uid(),
    (select staff_id from public.staff_profiles where auth_user_id = auth.uid()),
    action_name,
    tg_table_name,
    row_id,
    before_row,
    after_row
  );
  return coalesce(new, old);
end;
$$;

create or replace function public.confirm_staff_action(
  p_confirmation_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  action_row public.staff_action_confirmations%rowtype;
  staff_row public.staff_profiles%rowtype;
  staff_role public.staff_roles%rowtype;
  property_before jsonb;
  property_after jsonb;
  created_task public.tasks%rowtype;
begin
  select * into action_row
    from public.staff_action_confirmations
    where confirmation_id = p_confirmation_id
    for update;
  if not found or action_row.actor_user_id <> p_actor_user_id then
    raise exception 'confirmation not found' using errcode = '42501';
  end if;
  if action_row.status <> 'pending' or action_row.expires_at <= now() then
    raise exception 'confirmation is no longer available' using errcode = '22023';
  end if;

  select * into staff_row from public.staff_profiles
    where auth_user_id = p_actor_user_id and is_active;
  if not found then
    raise exception 'active staff profile required' using errcode = '42501';
  end if;
  select * into staff_role from public.staff_roles where role_id = staff_row.role_id;

  if action_row.action_type = 'property.update' then
    if not (
      staff_role.permissions @> '["*"]'::jsonb
      or (
        staff_role.permissions ? 'properties:assigned:update'
        and exists (
          select 1 from public.property_staff_assignments a
          where a.property_id = action_row.entity_id and a.staff_id = staff_row.staff_id
        )
      )
    ) then
      raise exception 'not authorized to update this property' using errcode = '42501';
    end if;
    if action_row.proposed_changes - array[
      'property_type', 'listing_price', 'location', 'description',
      'listing_status', 'square_footage', 'lot_size', 'bedrooms',
      'bathrooms', 'year_built', 'zoning_classification', 'days_on_market',
      'virtual_tour_url', 'features'
    ] <> '{}'::jsonb then
      raise exception 'unsupported property update field' using errcode = '22023';
    end if;
    select to_jsonb(p) into property_before
      from public.properties p where p.property_id = action_row.entity_id
      for update;
    if property_before is null then
      raise exception 'property not found' using errcode = 'P0002';
    end if;
    update public.properties p set
      property_type = case when action_row.proposed_changes ? 'property_type' then action_row.proposed_changes->>'property_type' else p.property_type end,
      listing_price = case when action_row.proposed_changes ? 'listing_price' then (action_row.proposed_changes->>'listing_price')::numeric else p.listing_price end,
      location = case when action_row.proposed_changes ? 'location' then action_row.proposed_changes->>'location' else p.location end,
      description = case when action_row.proposed_changes ? 'description' then action_row.proposed_changes->>'description' else p.description end,
      listing_status = case when action_row.proposed_changes ? 'listing_status' then action_row.proposed_changes->>'listing_status' else p.listing_status end,
      square_footage = case when action_row.proposed_changes ? 'square_footage' then (action_row.proposed_changes->>'square_footage')::numeric else p.square_footage end,
      lot_size = case when action_row.proposed_changes ? 'lot_size' then (action_row.proposed_changes->>'lot_size')::numeric else p.lot_size end,
      bedrooms = case when action_row.proposed_changes ? 'bedrooms' then (action_row.proposed_changes->>'bedrooms')::integer else p.bedrooms end,
      bathrooms = case when action_row.proposed_changes ? 'bathrooms' then (action_row.proposed_changes->>'bathrooms')::numeric else p.bathrooms end,
      year_built = case when action_row.proposed_changes ? 'year_built' then (action_row.proposed_changes->>'year_built')::integer else p.year_built end,
      zoning_classification = case when action_row.proposed_changes ? 'zoning_classification' then action_row.proposed_changes->>'zoning_classification' else p.zoning_classification end,
      days_on_market = case when action_row.proposed_changes ? 'days_on_market' then (action_row.proposed_changes->>'days_on_market')::integer else p.days_on_market end,
      virtual_tour_url = case when action_row.proposed_changes ? 'virtual_tour_url' then action_row.proposed_changes->>'virtual_tour_url' else p.virtual_tour_url end,
      features = case when action_row.proposed_changes ? 'features' then action_row.proposed_changes->'features' else p.features end
    where p.property_id = action_row.entity_id
    returning to_jsonb(p) into property_after;

    insert into public.audit_logs (
      actor_user_id, actor_staff_id, action, entity_type, entity_id, before_data, after_data
    ) values (
      p_actor_user_id, staff_row.staff_id, 'property.update.confirmed',
      'property', action_row.entity_id, property_before, property_after
    );
    update public.staff_action_confirmations
      set status = 'confirmed', confirmed_at = now()
      where confirmation_id = action_row.confirmation_id;
    return jsonb_build_object('action', action_row.action_type, 'entity_id', action_row.entity_id, 'result', property_after);

  elsif action_row.action_type = 'task.create' then
    if not (
      staff_role.permissions @> '["*"]'::jsonb
      or staff_role.permissions ? 'tasks:create'
    ) then
      raise exception 'not authorized to create tasks' using errcode = '42501';
    end if;
    if action_row.proposed_changes - array[
      'title', 'description', 'task_type', 'priority', 'assigned_to',
      'lead_id', 'property_id', 'due_at'
    ] <> '{}'::jsonb then
      raise exception 'unsupported task field' using errcode = '22023';
    end if;
    insert into public.tasks (
      title, description, task_type, priority, assigned_to, lead_id,
      property_id, due_at, created_by
    ) values (
      action_row.proposed_changes->>'title',
      action_row.proposed_changes->>'description',
      coalesce(action_row.proposed_changes->>'task_type', 'follow_up'),
      coalesce(action_row.proposed_changes->>'priority', 'normal'),
      coalesce((action_row.proposed_changes->>'assigned_to')::uuid, staff_row.staff_id),
      nullif(action_row.proposed_changes->>'lead_id', '')::uuid,
      nullif(action_row.proposed_changes->>'property_id', '')::uuid,
      nullif(action_row.proposed_changes->>'due_at', '')::timestamptz,
      staff_row.staff_id
    ) returning * into created_task;
    insert into public.audit_logs (
      actor_user_id, actor_staff_id, action, entity_type, entity_id, after_data
    ) values (
      p_actor_user_id, staff_row.staff_id, 'task.create.confirmed',
      'task', created_task.task_id, to_jsonb(created_task)
    );
    update public.staff_action_confirmations
      set status = 'confirmed', confirmed_at = now()
      where confirmation_id = action_row.confirmation_id;
    return jsonb_build_object('action', action_row.action_type, 'entity_id', created_task.task_id, 'result', to_jsonb(created_task));
  end if;

  raise exception 'unsupported confirmation action' using errcode = '22023';
end;
$$;

create or replace function public.assign_staff_lead(
  p_lead_id uuid,
  p_staff_id uuid,
  p_actor_user_id uuid,
  p_assignment_reason text default 'manual'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_profile public.staff_profiles%rowtype;
  actor_role public.staff_roles%rowtype;
  target_profile public.staff_profiles%rowtype;
  prior_assignee uuid;
begin
  select * into actor_profile from public.staff_profiles
    where auth_user_id = p_actor_user_id and is_active;
  if not found then
    raise exception 'active staff profile required' using errcode = '42501';
  end if;
  select * into actor_role from public.staff_roles where role_id = actor_profile.role_id;
  if not (actor_role.permissions @> '["*"]'::jsonb or actor_role.permissions ? 'leads:assign') then
    raise exception 'not authorized to assign leads' using errcode = '42501';
  end if;
  select * into target_profile from public.staff_profiles
    where staff_id = p_staff_id and is_active;
  if not found then
    raise exception 'active assignee not found' using errcode = 'P0002';
  end if;
  select assigned_staff_id into prior_assignee from public.leads
    where lead_id = p_lead_id for update;
  if not found then
    raise exception 'lead not found' using errcode = 'P0002';
  end if;
  update public.leads set assigned_staff_id = p_staff_id where lead_id = p_lead_id;
  insert into public.lead_assignment_history (lead_id, staff_id, assigned_by, assignment_reason)
    values (p_lead_id, p_staff_id, actor_profile.staff_id, left(coalesce(p_assignment_reason, 'manual'), 80));
  insert into public.audit_logs (
    actor_user_id, actor_staff_id, action, entity_type, entity_id, before_data, after_data
  ) values (
    p_actor_user_id, actor_profile.staff_id, 'lead.assigned', 'lead', p_lead_id,
    jsonb_build_object('assigned_staff_id', prior_assignee),
    jsonb_build_object('assigned_staff_id', p_staff_id)
  );
  insert into public.notifications (
    event_type, lead_id, title, message, dedupe_key, recipient_user_id
  ) values (
    'lead.assigned', p_lead_id, 'Lead assigned',
    'A lead has been assigned to you.',
    'lead:' || p_lead_id::text || ':assigned:' || gen_random_uuid()::text,
    target_profile.auth_user_id
  );
  return jsonb_build_object('lead_id', p_lead_id, 'assigned_staff_id', p_staff_id);
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['properties', 'leads', 'tasks', 'staff_profiles'] loop
    execute format('drop trigger if exists audit_row_change on public.%I', table_name);
    execute format(
      'create trigger audit_row_change after insert or update or delete on public.%I for each row execute function public.log_agency_row_change()',
      table_name
    );
  end loop;
end;
$$;

create or replace function public.create_assistant_match_request(
  p_lead jsonb,
  p_match jsonb,
  p_request_id uuid
)
returns table (lead_id uuid, request_id uuid, was_created boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  lead_result record;
  match_result public.property_match_requests%rowtype;
  existing_request uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('match-request:' || p_request_id::text, 0));
  if coalesce((p_lead->>'consent_to_contact')::boolean, false) is not true
     or coalesce((p_lead->>'consent_to_updates')::boolean, false) is not true then
    raise exception 'contact and property update consent are required' using errcode = '22023';
  end if;
  select r.request_id into existing_request
  from public.assistant_match_request_keys r
  where r.idempotency_key = p_request_id;
  if found then
    return query select r.lead_id, r.request_id, false
      from public.assistant_match_request_keys r
      where r.idempotency_key = p_request_id;
    return;
  end if;

  select * into lead_result
  from public.create_or_update_assistant_lead(p_lead, p_request_id);

  update public.leads
  set consent_to_updates = true
  where public.leads.lead_id = lead_result.lead_id;

  insert into public.property_match_requests (
    lead_id, preferred_location, budget_min, budget_max, property_type,
    bedrooms_required, additional_requirements, criteria_fingerprint, match_status
  ) values (
    lead_result.lead_id,
    nullif(trim(p_match->>'preferred_location'), ''),
    nullif(p_match->>'budget_min', '')::numeric,
    nullif(p_match->>'budget_max', '')::numeric,
    nullif(trim(p_match->>'property_type'), ''),
    nullif(p_match->>'bedrooms_required', '')::integer,
    coalesce(p_match->'additional_requirements', '{}'::jsonb),
    md5(concat_ws('|',
      lower(trim(coalesce(p_match->>'preferred_location', ''))),
      coalesce(p_match->>'budget_min', ''),
      coalesce(p_match->>'budget_max', ''),
      lower(trim(coalesce(p_match->>'property_type', ''))),
      coalesce(p_match->>'bedrooms_required', ''),
      coalesce(p_match->'additional_requirements', '{}'::jsonb)::text
    )),
    'waiting'
  ) on conflict (lead_id, criteria_fingerprint) do update
    set match_status = 'waiting', updated_at = now()
  returning * into match_result;

  insert into public.assistant_match_request_keys (idempotency_key, lead_id, request_id)
  values (p_request_id, lead_result.lead_id, match_result.request_id);

  perform public.match_property_to_waitlist(p.property_id)
    from public.properties p
    where p.listing_status = 'active';

  return query select lead_result.lead_id, match_result.request_id, true;
end;
$$;

revoke all on function public.match_property_to_waitlist(uuid) from public, anon, authenticated;
grant execute on function public.match_property_to_waitlist(uuid) to service_role;
revoke all on function public.create_assistant_match_request(jsonb, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.create_assistant_match_request(jsonb, jsonb, uuid) to service_role;
revoke all on function public.run_overdue_lead_automation(integer) from public, anon, authenticated;
grant execute on function public.run_overdue_lead_automation(integer) to service_role;
revoke all on function public.process_automation_jobs(integer) from public, anon, authenticated;
grant execute on function public.process_automation_jobs(integer) to service_role;
revoke all on function public.get_agency_operation_summary(integer) from public, anon, authenticated;
grant execute on function public.get_agency_operation_summary(integer) to service_role;
revoke all on function public.confirm_staff_action(uuid, uuid) from public, anon, authenticated;
grant execute on function public.confirm_staff_action(uuid, uuid) to service_role;
revoke all on function public.assign_staff_lead(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.assign_staff_lead(uuid, uuid, uuid, text) to service_role;

alter table public.staff_roles enable row level security;
alter table public.staff_profiles enable row level security;
alter table public.lead_assignment_history enable row level security;
alter table public.property_staff_assignments enable row level security;
alter table public.tasks enable row level security;
alter table public.property_match_requests enable row level security;
alter table public.property_matches enable row level security;
alter table public.property_match_deliveries enable row level security;
alter table public.audit_logs enable row level security;
alter table public.automation_jobs enable row level security;
alter table public.assistant_match_request_keys enable row level security;
alter table public.staff_action_confirmations enable row level security;
alter table public.staff_assistant_conversations enable row level security;

drop policy if exists "Staff read own profile" on public.staff_profiles;
create policy "Staff read own profile" on public.staff_profiles
  for select to authenticated using (auth_user_id = auth.uid());
drop policy if exists "Staff read own role" on public.staff_roles;
create policy "Staff read own role" on public.staff_roles
  for select to authenticated using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.role_id = staff_roles.role_id
        and sp.auth_user_id = auth.uid()
        and sp.is_active
    )
  );
drop policy if exists "Staff read assigned tasks" on public.tasks;
create policy "Staff read assigned tasks" on public.tasks
  for select to authenticated using (
    assigned_to in (select staff_id from public.staff_profiles where auth_user_id = auth.uid() and is_active)
  );
drop policy if exists "Staff update assigned tasks" on public.tasks;
create policy "Staff update assigned tasks" on public.tasks
  for update to authenticated using (
    assigned_to in (select staff_id from public.staff_profiles where auth_user_id = auth.uid() and is_active)
  ) with check (
    assigned_to in (select staff_id from public.staff_profiles where auth_user_id = auth.uid() and is_active)
  );
drop policy if exists "Staff read assigned notifications" on public.notifications;
create policy "Staff read assigned notifications" on public.notifications
  for select to authenticated using (
    recipient_user_id = auth.uid()
    or (auth.jwt() -> 'app_metadata' ->> 'agency_role') = 'admin'
  );

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'staff_roles', 'staff_profiles', 'lead_assignment_history',
    'property_staff_assignments', 'tasks', 'property_match_requests',
    'property_matches', 'property_match_deliveries', 'audit_logs',
    'automation_jobs', 'assistant_match_request_keys',
    'staff_action_confirmations', 'staff_assistant_conversations'
  ] loop
    execute format('revoke all on public.%I from public, anon, authenticated', table_name);
    execute format('grant all on public.%I to service_role', table_name);
  end loop;
end;
$$;

grant select on public.staff_profiles, public.staff_roles, public.tasks, public.notifications to authenticated;
grant update (status, completed_at) on public.tasks to authenticated;
revoke all on public.staff_action_confirmations, public.staff_assistant_conversations
  from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tasks'
  ) then
    alter publication supabase_realtime add table public.tasks;
  end if;
end;
$$;
